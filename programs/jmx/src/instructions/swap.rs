use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_client::{PriceType};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;
use crate::error::{ErrorCode};
use std::cmp::max;
use mint_lp_token::{calculate_aum, calculate_fee_basis_points};

// need to check that the mint provided matches the redeemable mint
// CHECK: that mints and provided assets match for all provided accounts
// CHECK: that oracle timestamps are good
#[derive(Accounts)]
#[instruction(exchange_name: String, input_asset_name: String, output_asset_name: String, lamports: u64)]
pub struct Swap<'info> {
		// user accounts
    #[account(mut)]
    pub user_authority: Signer<'info>,
		#[account(mut)]
		pub user_input_token: Box<Account<'info, TokenAccount>>,
		#[account(mut)]
		pub user_output_token: Box<Account<'info, TokenAccount>>,
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
			seeds = [exchange_name.as_bytes(), input_asset_name.as_bytes()],
			bump,
		)]
		pub input_available_asset: Account<'info, AvailableAsset>,
		#[account(
			mut,
			seeds = [exchange_name.as_bytes(), output_asset_name.as_bytes()],
			bump,
		)]
		pub output_available_asset: Account<'info, AvailableAsset>,
		#[account(
			mut,
			seeds = [input_asset_name.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		pub input_exchange_reserve_token: Box<Account<'info, TokenAccount>>,
		#[account(
			mut,
			seeds = [output_asset_name.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		pub output_exchange_reserve_token: Box<Account<'info, TokenAccount>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// CHECK: remove unessary accounts and inputs
// CHECK: need to match the base bps + tax bps from GMX
// CHECK: need to check that oracle account provided matches oracle account in available asset
pub fn handler(
	ctx: Context<Swap>, 
	exchange_name: String, 
	input_asset_name: String, 
	output_asset_name: String, 
	lamports: u64
) -> ProgramResult {
	// transfer asset in
	// get the value of transferred asset in
	// remove the bps of value from trading fees
	// get the value in usd of the transferred assets
	// divide the value by the price of the out asset
	// determine the slippage/price impact
		// get the worse base fee rate between using the two assets
		// use the worse fee from the two calls to calculating basis fees as the fee
		// uint256 feesBasisPoints0 = getFeeBasisPoints(_tokenIn, _usdgAmount, baseBps, taxBps, true);
		// uint256 feesBasisPoints1 = getFeeBasisPoints(_tokenOut, _usdgAmount, baseBps, taxBps, false);
	assert!(
		ctx.remaining_accounts.len() / 2 == ctx.accounts.exchange.assets.len(), 
		"must supply all whitelisted assets when minting"
	);
	assert!(lamports > 100, "too few lamports for transaction");

	// transfer lamports from user to reserve_asset_token_acount
	let input_exchange_reserve_token = &ctx.accounts.input_exchange_reserve_token;
	let output_exchange_reserve_token = &ctx.accounts.output_exchange_reserve_token;
	// msg!("lamports {}", lamports);

	let (aum, input_precise_price, input_exponent) = calculate_aum(
		ctx.remaining_accounts, 
		input_exchange_reserve_token,
		&ctx.accounts.exchange.price_oracles
	).unwrap();

	let (aum, output_precise_price, output_exponent) = calculate_aum(
		ctx.remaining_accounts, 
		output_exchange_reserve_token,
		&ctx.accounts.exchange.price_oracles
	).unwrap();

	msg!("output_exponent {} input precise price {} lamports {}",output_exponent, input_precise_price, lamports );
	let gross_output_asset_out = (input_precise_price as u128).
		checked_mul(lamports as u128).
		unwrap().
		checked_mul(10_u128.pow(output_exponent as u32)).
		unwrap().
		checked_div(output_precise_price  as u128).
		unwrap().
		checked_div(10_u128.pow(input_exponent as u32)).
		unwrap() as u64;

	msg!("gross_output_asset_out {}", gross_output_asset_out);
	let input_total_fee_in_basis_points = calculate_fee_basis_points(
		aum,
		&ctx.accounts.input_available_asset,
		ctx.accounts.exchange.total_weights,
		input_precise_price,
		input_exponent,
		lamports,
		true
	);

	let output_total_fee_in_basis_points = calculate_fee_basis_points(
		aum,
		&ctx.accounts.output_available_asset,
		ctx.accounts.exchange.total_weights,
		output_precise_price,
		output_exponent,
		gross_output_asset_out,
		false
	);

	let net_output_asset_out = gross_output_asset_out.
		checked_mul(BASIS_POINTS_PRECISION as u64).
		unwrap().
		checked_div(max(input_total_fee_in_basis_points, output_total_fee_in_basis_points)).
		unwrap();

	msg!("net_output_asset_out {}", net_output_asset_out);
	let exchange_auth_bump = match ctx.bumps.get("exchange_authority") {
			Some(bump) => {
					bump
			}
			None => {
					msg!("Wrong bump key. Available keys are {:?}", ctx.bumps.keys());
					panic!("Wrong bump key")
			}
	};

	let exchange_name = ctx.accounts.exchange.name.as_ref();
	let seeds = exchange_authority_seeds!(
			exchange_name = exchange_name,
			bump = *exchange_auth_bump
	);
	let signer = &[&seeds[..]];

	token::transfer(
		ctx.accounts.into_transfer_in_context(), 
		lamports as u64
	)?;

	token::transfer(
		ctx.accounts.into_transfer_out_context(signer), 
		net_output_asset_out as u64
	)?;

	let output_available_asset = &mut ctx.accounts.output_available_asset;
	let input_available_asset = &mut ctx.accounts.input_available_asset;
	assert!(
		(output_available_asset.pool_reserves - output_available_asset.fee_reserves) > net_output_asset_out,
		"not enough available pool reserves"
	);

	msg!("lamports in {} asset out {} fees kept in addition to asset out {}", lamports, net_output_asset_out, gross_output_asset_out - net_output_asset_out);
	input_available_asset.pool_reserves += lamports;
	output_available_asset.pool_reserves -= gross_output_asset_out;
	output_available_asset.fee_reserves += gross_output_asset_out - net_output_asset_out;
	Ok(())
}

impl<'info> Swap<'info> {
	pub fn into_transfer_in_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
			let cpi_accounts = Transfer {
					from: self.user_input_token.to_account_info(),
					to: self.input_exchange_reserve_token.to_account_info(),
					authority: self.user_authority.to_account_info(),
			};
			let cpi_program = self.token_program.to_account_info();
			CpiContext::new(cpi_program, cpi_accounts)
	}
	pub fn into_transfer_out_context<'a, 'b, 'c>(
		&self,
		signer: &'a [&'b [&'c [u8]]],
	) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
		let cpi_accounts = Transfer {
				from: self.output_exchange_reserve_token.to_account_info(),
				to: self.user_output_token.to_account_info(),
				authority: self.exchange_authority.to_account_info(),
		};
		let cpi_program = self.token_program.to_account_info();
		CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
	}
}