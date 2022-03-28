use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;
use mint_lp_token::{calculate_aum, calculate_fee_basis_points};

// need to check that the mint provided matches the redeemable mint
// CHECK: that mints and provided assets match for all provided accounts
#[derive(Accounts)]
#[instruction(exchange_name: String, asset_name: String, lamports: u64)]
pub struct BurnLpToken<'info> {
		// user accounts
    #[account(mut)]
    pub user_authority: Signer<'info>,
		#[account(mut)]
		pub user_reserve_token: Box<Account<'info, TokenAccount>>,
		#[account(mut)]
		pub user_lp_token: Box<Account<'info, TokenAccount>>,
    // exchange Accounts
		/// CHECK: this is our authority, no checked account required
		#[account(
			mut,
			seeds = [EXCHANGE_AUTHORITY_SEED.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		pub exchange_authority: UncheckedAccount<'info>,
    #[account(
			mut,
			seeds = [exchange_name.as_bytes()],
			bump,
    )]
		pub exchange: Box<Account<'info, Exchange>>,
		#[account(
			mut,
			seeds = [exchange_name.as_bytes(), asset_name.as_bytes()],
			bump,
		)]
		pub available_asset: Account<'info, AvailableAsset>,
		#[account(
			mut,
			seeds = [asset_name.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		pub exchange_reserve_token: Box<Account<'info, TokenAccount>>,
		#[account(
			mut,
			seeds = [LP_MINT_SEED.as_bytes(), exchange_name.as_bytes()],
			bump
		)]
    pub lp_mint: Box<Account<'info, Mint>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// CHECK: need to check that oracle account provided matches oracle account in available asset
pub fn handler(ctx: Context<BurnLpToken>, exchange_name: String, asset_name: String, lamports: u64) -> ProgramResult {
	assert!(lamports > 100, "too few lamports for transaction");
	assert!(
		ctx.remaining_accounts.len() / 2 == ctx.accounts.exchange.assets.len(), 
		"must supply all whitelisted assets when burning"
	);
	assert!(ctx.accounts.lp_mint.supply > lamports, "not enough lp token exists");

	// transfer lamports from user to reserve_asset_token_acount
	let exchange_reserve_token = &ctx.accounts.exchange_reserve_token;
	msg!("lamports {}", lamports);

	let (oracles, available_assets) = get_price_and_available_assets(
		ctx.remaining_accounts,
		&ctx.accounts.exchange.price_oracles
	);
	let (aum, precise_price, exponent) = calculate_aum(
		&oracles, 
		&available_assets,
		exchange_reserve_token,
	).unwrap();

	msg!("about to log lp_mint");
	let lp_mint = &ctx.accounts.lp_mint;
	msg!("lp_mint {:?}", lp_mint.key());

	let lp_mint_supply = lp_mint.supply;
	let total_fee_in_basis_points = calculate_fee_basis_points(
		aum,
		&ctx.accounts.available_asset,
		ctx.accounts.exchange.total_weights,
		precise_price,
		exponent,
		lamports,
		false
	);
	msg!("FEE_IN_BASIS_POINTS {}", FEE_IN_BASIS_POINTS);
	msg!("total_fee_in_basis_points {}", total_fee_in_basis_points);
	let price_per_lp_token_numerator = aum.checked_mul(total_fee_in_basis_points as u64)
		.unwrap();

	let price_per_lp_token_denominator = lp_mint_supply.checked_mul(BASIS_POINTS_PRECISION as u64)
			.unwrap();
	
	msg!("precise_price {}", precise_price);
	let usd_value_of_burn = lamports.
		checked_mul(price_per_lp_token_numerator).
		unwrap().
		checked_div(price_per_lp_token_denominator).
		unwrap();

	msg!("usd_value_of_burn {}", usd_value_of_burn);
	
	let burn_value_to_reserve_amount = usd_value_of_burn.
		checked_mul(10_u128.pow(exponent as u32) as u64).
		unwrap().
		checked_div(precise_price)
		.unwrap();
	
	msg!("numerator price_per_lp_token_numerator {}", price_per_lp_token_numerator);
	msg!("denom price_per_lp_token_denominator {}", price_per_lp_token_denominator);
	msg!("burn_value_to_reserve_amount {}", burn_value_to_reserve_amount);

	let exchange_auth_bump = match ctx.bumps.get("exchange_authority") {
			Some(bump) => {
					bump
			}
			None => {
					msg!("Wrong bump key. Available keys are {:?}", ctx.bumps.keys());
					panic!("Wrong bump key")
			}
	};

	let transfer_reserve_amount = burn_value_to_reserve_amount.
	checked_mul(BASIS_POINTS_PRECISION as u64).
	unwrap().
	checked_div(total_fee_in_basis_points).
	unwrap();

	msg!("transfer_reserve_amount {}", transfer_reserve_amount);

	let exchange_name = ctx.accounts.exchange.name.as_ref();
	let seeds = exchange_authority_seeds!(
			exchange_name = exchange_name,
			bump = *exchange_auth_bump
	);
	let signer = &[&seeds[..]];

	token::burn(ctx.accounts.into_burn_context(), lamports as u64)?;

	token::transfer(
		ctx.accounts.into_transfer_context(signer),
		transfer_reserve_amount as u64,
	)?;

	let asset = &mut ctx.accounts.available_asset;
	asset.pool_reserves -= burn_value_to_reserve_amount;
	asset.fee_reserves += burn_value_to_reserve_amount - transfer_reserve_amount;
	msg!("pool reserves {} fee reserves {}", asset.pool_reserves, asset.fee_reserves);
	Ok(())
}

impl<'info> BurnLpToken<'info> {
	pub fn into_transfer_context<'a, 'b, 'c>(
		&self, 
		signer: &'a [&'b [&'c [u8]]]
	) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
			let cpi_accounts = Transfer {
					from: self.exchange_reserve_token.to_account_info(),
					to:  self.user_reserve_token.to_account_info(),
					authority: self.exchange_authority.to_account_info(),
			};
			let cpi_program = self.token_program.to_account_info();
			CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
	}
	pub fn into_burn_context<'a, 'b, 'c>(
		&self,
	) -> CpiContext<'a, 'b, 'c, 'info, Burn<'info>> {
			let cpi_accounts = Burn {
					mint: self.lp_mint.to_account_info(),
					to: self.user_lp_token.to_account_info(),
					authority: self.user_authority.to_account_info(),
			};
			let cpi_program = self.token_program.to_account_info();
			CpiContext::new(cpi_program, cpi_accounts)
	}
}