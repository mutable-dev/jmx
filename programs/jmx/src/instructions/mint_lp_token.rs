use std::ops::{Sub, Add, Div, Mul};

use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_client::{PriceType};
use solana_program::program_pack::Pack;
use spl_token::state::Account as SPLTokenAccount;
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;
use crate::error::{ErrorCode};
use std::cmp::max;
use std::convert::TryInto;

// need to check that the mint provided matches the redeemable mint
// CHECK: that mints and provided assets match for all provided accounts
#[derive(Accounts)]
#[instruction(exchange_name: String, asset_name: String, lamports: u64)]
pub struct MintLpToken<'info> {
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
// CHECK: need to evauluate the max amount of the provided token we will accept and not go over that
pub fn handler(ctx: Context<MintLpToken>, exchange_name: String, asset_name: String, lamports: u64) -> ProgramResult {
	assert!(
		ctx.remaining_accounts.len() / 2 == ctx.accounts.exchange.assets.len(), 
		"must supply all whitelisted assets when minting"
	);
	assert!(lamports > 100, "too few lamports for transaction");

	// transfer lamports from user to reserve_asset_token_acount
	let exchange_reserve_token = &ctx.accounts.exchange_reserve_token;
	msg!("lamports {}", lamports);

	let (aum, precise_price, exponent) = calculate_aum(
		ctx.remaining_accounts, 
		exchange_reserve_token,
		&ctx.accounts.exchange.price_oracles
	).unwrap();

	msg!("precise price {}", precise_price);
	let lp_mint = &ctx.accounts.lp_mint;
	msg!("lp_mint {:?}", lp_mint.key());

	let lp_mint_supply = lp_mint.supply;
	let mut price_per_lp_token_numerator = 1;
	let mut price_per_lp_token_denominator = 1;
	let mut total_fee_in_basis_points = BASIS_POINTS_PRECISION as u64;

	if lp_mint_supply > 0 {
		msg!("we have current aum:{:?} mint_supply: {:?}", aum, lp_mint_supply);
		total_fee_in_basis_points = calculate_fee_basis_points(
			aum,
			&ctx.accounts.available_asset,
			ctx.accounts.exchange.total_weights,
			precise_price,
			exponent,
			lamports,
			true
		);
		// msg!("FEE_IN_BASIS_POINTS {}", FEE_IN_BASIS_POINTS);
		msg!("total_fee_in_basis_points {}", total_fee_in_basis_points);
		let raw_bps_to_charge = total_fee_in_basis_points.checked_sub(BASIS_POINTS_PRECISION as u64).unwrap();
		price_per_lp_token_numerator = lp_mint_supply.checked_mul(BASIS_POINTS_PRECISION - raw_bps_to_charge as u64)
		.unwrap();
		
		price_per_lp_token_denominator = aum.checked_mul(BASIS_POINTS_PRECISION)
				.unwrap();
		msg!("price_per_lp_token_numerator {} price_per_lp_token_denominator {}", price_per_lp_token_numerator, price_per_lp_token_denominator);
		msg!("raw_bps_to_charge {}", raw_bps_to_charge)
	}
	
	msg!("precise_price {}", precise_price);
	let usd_value_of_deposit = precise_price.
		checked_mul(lamports).
		unwrap().
		checked_div(10_u128.pow(exponent as u32) as u64).
		unwrap();
	
	// msg!("numerator price_per_lp_token_numerator {}", price_per_lp_token_numerator);
	// msg!("denom price_per_lp_token_denominator {}", price_per_lp_token_denominator);
	msg!("usd_value_of_deposit {}", usd_value_of_deposit);
	let amount_of_glp_to_mint = (usd_value_of_deposit as u128).
		checked_mul(price_per_lp_token_numerator as u128).
		unwrap().
		checked_div(price_per_lp_token_denominator as u128).
		unwrap() as u64;

	msg!("amount_of_glp_to_mint {}", amount_of_glp_to_mint);
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
		ctx.accounts.into_transfer_context(),
		lamports as u64,
	)?;

	token::mint_to(ctx.accounts.into_mint_to_context(signer), amount_of_glp_to_mint as u64)?;
	// update reserve amounts on available asset
	let asset = &mut ctx.accounts.available_asset;
	let new_pool_reserves = lamports.
	checked_mul(BASIS_POINTS_PRECISION as u64).
	unwrap().
	checked_div(total_fee_in_basis_points).
	unwrap();

	asset.pool_reserves += new_pool_reserves;
	asset.fee_reserves += lamports - new_pool_reserves;
	Ok(())
}

// cases to consider
// 1. initialAmount is far from targetAmount, action increases balance slightly => high rebate
// 2. initialAmount is far from targetAmount, action increases balance largely => high rebate
// 3. initialAmount is close to targetAmount, action increases balance slightly => low rebate
// 4. initialAmount is far from targetAmount, action reduces balance slightly => high tax
// 5. initialAmount is far from targetAmount, action reduces balance largely => high tax
// 6. initialAmount is close to targetAmount, action reduces balance largely => low tax
// 7. initialAmount is above targetAmount, nextAmount is below targetAmount and vice versa
// 8. a large swap should have similar fees as the same trade split into multiple smaller swaps
/// CHECK: types here are bad, and conversions too many, need to consolidate
/// CHECK: that we are doing the correct math when calculating
/// fees that should be charged 
/// CHECK: that we are calculating available assets correctly
/// CHECK: that we should calculate the current reserves to compare against target reserves using 
/// only the available asset, relies on how AUM is calculated
pub fn calculate_fee_basis_points(
	aum: u64,
	available_asset: &AvailableAsset, 
	total_weight: u64, 
	price: u64,
	exponent: u64,
	new_amount: u64,
	increment: bool
) -> u64 {
	let current_reserves = available_asset.pool_reserves;
	msg!("price {}", price);
	msg!("exponent in calc fee bps {}", exponent);
	let initial_reserve_usd_value = (current_reserves).
		checked_mul(price as u64).
		unwrap().
		checked_div(10_i64.pow(exponent as u32) as u64)
		.unwrap();

	let diff_usd_value = new_amount.
		checked_mul(price as u64).
		unwrap().
		checked_div(10_u128.pow(exponent as u32) as u64)
		.unwrap();

	msg!("new amount {}", new_amount);
	let next_reserve_usd_value = if increment { 
		msg!("next reserve value {}", initial_reserve_usd_value + diff_usd_value);
		initial_reserve_usd_value + diff_usd_value 
	} else { 
		msg!("maxxx initial_reserve_usd_value - diff_usd_value {}", initial_reserve_usd_value - diff_usd_value);
		max((initial_reserve_usd_value - diff_usd_value) as i64, 0 as i64) as u64
	};
	
	msg!("cur token weight {}", available_asset.token_weight);
	msg!("total weights {}", total_weight);
	let target_lp_usd_value = available_asset.token_weight.
		checked_mul(aum).
		unwrap().
		checked_div(total_weight).
		unwrap();

	msg!("diff_usd_value {}", diff_usd_value);
	msg!("current_reserves {}", current_reserves);
	msg!("initial_reserve_usd_value {}", initial_reserve_usd_value);
	msg!("next_reserve_usd_value {}", next_reserve_usd_value );
	msg!("target_lp_usd_value {}", target_lp_usd_value);
	if target_lp_usd_value == 0 {
		msg!("returning fee in basis points");
		return FEE_IN_BASIS_POINTS as u64;
	}

	let initial_usd_from_target = if initial_reserve_usd_value > target_lp_usd_value { 
		(initial_reserve_usd_value - target_lp_usd_value) as i64
	} else { (target_lp_usd_value - initial_reserve_usd_value) as i64 };

	let next_usd_from_target = if next_reserve_usd_value > target_lp_usd_value { 
		(next_reserve_usd_value - target_lp_usd_value) as i64
	} else { (target_lp_usd_value - next_reserve_usd_value) as i64 };

	// action improves target balance
	if next_usd_from_target < initial_usd_from_target {
		msg!("next_usd_from_target {} initial_usd_from_target {}", next_usd_from_target, initial_usd_from_target);
		let rebate_bps = (FEE_IN_BASIS_POINTS as i64).
			checked_sub(BASIS_POINTS_PRECISION as i64).
			unwrap().
			checked_mul(initial_usd_from_target).
			unwrap().
			checked_div(target_lp_usd_value as i64).
			unwrap();
		msg!("rebate bps {} initial_usd_from_target {} target_lp_usd_value {}", rebate_bps, initial_usd_from_target, target_lp_usd_value);
		return if rebate_bps >= FEE_RAW as i64 {
			msg!("returning precision");
			BASIS_POINTS_PRECISION as u64
		} else { 
			msg!("returning (FEE_IN_BASIS_POINTS as i64).sub(rebate_bps ) {}", (FEE_IN_BASIS_POINTS as i64).sub(rebate_bps ));
			(FEE_IN_BASIS_POINTS as i64).sub(rebate_bps ) as u64 
		};
	} else if next_usd_from_target == initial_usd_from_target {
		return FEE_IN_BASIS_POINTS
	}

	let mut average_diff = initial_usd_from_target.add(next_usd_from_target).div(2);
	msg!("average_diff {}", average_diff);
	if average_diff > target_lp_usd_value as i64{
		average_diff = target_lp_usd_value as i64;
	}

	let penalty = (PENALTY_IN_BASIS_POINTS as i64).mul(average_diff).div(target_lp_usd_value as i64);
	return (FEE_IN_BASIS_POINTS as u64).add(penalty as u64)
}

// CHECK: that we should take the value of the token account as AUM and not the general reserves from the
// available asset account
pub fn calculate_aum(
	remaining_accounts: &[AccountInfo], 
	exchange_reserve_token: &Box<anchor_lang::prelude::Account<'_, TokenAccount>>,
	price_oracles: &Vec<anchor_lang::prelude::Pubkey>
) -> Result<(u64,u64,u64)> {
	for o in price_oracles.iter() {
		msg!("{}", o);
	}
	let mut aum = 0;
	let mut precise_price = 0;
	let mut exponent = 1;
	let mut last_token_account: SPLTokenAccount = SPLTokenAccount::unpack_unchecked(&remaining_accounts[0].data.borrow())?;
	// msg!("remaining_accounts {:?}", remaining_accounts);
	for (i, token_account_info) in remaining_accounts.iter().enumerate() {
		// msg!("iterating {}", i);
		if i % 2 == 0 {
			// token account
			if token_account_info.owner != &spl_token::id() {
				return Err(ErrorCode::AccountNotSystemOwned.into());
			}
			let unpacked_token_account = SPLTokenAccount::unpack_unchecked(&token_account_info.data.borrow())?;
			last_token_account = unpacked_token_account;
		} else {
			// oracle account
			// CHECK: need to validate pyth data better here
			// msg!("data key {}", token_account_info.key);
			assert!(price_oracles.contains(token_account_info.key), "invalid oracle account provided");

			let pyth_price_data = &token_account_info.try_borrow_data()?;
			// msg!("after borrow price data {}", &token_account_info.key);
			// msg!("Pyth Price size {} account size {}", std::mem::size_of::<pyth_client::Price>(), pyth_price_data.len());
			let pyth_price = pyth_client::cast::<pyth_client::Price>(pyth_price_data);
			// get price of asset to deposit

			// msg!("last_token_account.mint {}", last_token_account.mint);
			// msg!("exchange_reserve_token.mint {}", exchange_reserve_token.mint);
			if last_token_account.mint == exchange_reserve_token.mint {
				msg!("found last_token_account.mint {}", last_token_account.mint);
				msg!("exchange_reserve_token.mint {}", exchange_reserve_token.mint);
				// msg!("found price oracle for reserve asset...about to set reserve asset price {}", pyth_price.agg.price);
				exponent = pyth_price.expo.abs() as u64;
				precise_price = pyth_price.agg.price as u64;
				// msg!(" in calc aum w/ expo {} precise price {}", pyth_price.expo, pyth_price.agg.price)
			}

			let price = pyth_price.agg.price;
			// msg!("about to add to aum in calc aum");
			aum += last_token_account.amount.checked_mul(price as u64)
				.unwrap()
				.checked_div(
					10_u64.pow(pyth_price.expo.abs() as u32)
				)
				.unwrap();
			// msg!("about to return in calc aum");
		}
	}
	Ok((aum, precise_price, exponent))
}

impl<'info> MintLpToken<'info> {
	pub fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
			let cpi_accounts = Transfer {
					from: self.user_reserve_token.to_account_info(),
					to: self.exchange_reserve_token.to_account_info(),
					authority: self.user_authority.to_account_info(),
			};
			let cpi_program = self.token_program.to_account_info();
			CpiContext::new(cpi_program, cpi_accounts)
	}
	pub fn into_mint_to_context<'a, 'b, 'c>(
		&self,
		signer: &'a [&'b [&'c [u8]]],
	) -> CpiContext<'a, 'b, 'c, 'info, MintTo<'info>> {
			let cpi_accounts = MintTo {
					mint: self.lp_mint.to_account_info(),
					to: self.user_lp_token.to_account_info(),
					authority: self.exchange_authority.to_account_info(),
			};
			let cpi_program = self.token_program.to_account_info();
			CpiContext::new_with_signer(cpi_program, cpi_accounts, signer)
	}
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;
    use anchor_lang::prelude::{Pubkey};
		use crate::calculate_fee_basis_points;
    use crate::state::AvailableAsset;

    #[test]
    fn exploration() {
        assert_eq!(2 + 2, 4);
    }

		fn create_available_asset() -> AvailableAsset {
			AvailableAsset {
				mint_address: Pubkey::from_str("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS").unwrap(),
				token_decimals: 1,
				token_weight: 5,
				min_profit_basis_points: 100,
				max_lptoken_amount: 100,
				stable_token: false,
				shortable_token: false,
				cumulative_funding_rate: 0,
				last_funding_time: 0,
				oracle_address: Pubkey::from_str("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS").unwrap(),
				backup_oracle_address: Pubkey::from_str("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS").unwrap(),
				global_short_size: 0,
				net_protocol_liabilities: 0,
				occupied_reserves: 0,
				fee_reserves: 0,
				pool_reserves: 400
			}
		}

    #[test]
    fn slightly_improves_basket_add() {
				let available_asset = create_available_asset();
				let fees = calculate_fee_basis_points(
					100_000,
					&available_asset,
					10,
					100_0000,
					4,
					100,
					true
				);
				assert_eq!(10024, fees);
    }

		#[test]
		fn strongly_improves_basket_add() {
			let available_asset = &mut create_available_asset();
			available_asset.pool_reserves = 4;

			let fees = calculate_fee_basis_points(
				100_000,
				&available_asset,
				10,
				100_0000,
				4,
				100,
				true
			);
			assert_eq!(10001, fees);
	}

	#[test]
	fn strongly_harms_basket_add() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 500;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			10000,
			true
		);
		assert_eq!(10060, fees);
	}

	#[test]
	fn lightly_harms_basket_add() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 500;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			50,
			true
		);
		assert_eq!(10031, fees);
	}

	#[test]
	fn slightly_improves_basket_remove() {
			let available_asset = &mut create_available_asset();
			available_asset.pool_reserves = 550;
			let fees = calculate_fee_basis_points(
				100_000,
				&available_asset,
				10,
				100_0000,
				4,
				10,
				false
			);
			assert_eq!(10027, fees);
	}
	
	#[test]
	fn strongly_improves_basket_remove() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 1000;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			100,
			false
		);
		assert_eq!(10000, fees);
	}

	#[test]
	fn strongly_harms_basket_remove() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 10;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			5,
			false
		);
		assert_eq!(10059, fees);
	}

	#[test]
	fn lightly_harms_basket_remove() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 500;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			50,
			false
		);
		assert_eq!(10031, fees);
	}

	#[test]
	fn neutral_basket_remove() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 550;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			100,
			false
		);
		assert_eq!(10030, fees);
	}

	#[test]
	fn neutral_basket_add() {
		let available_asset = &mut create_available_asset();
		available_asset.pool_reserves = 450;

		let fees = calculate_fee_basis_points(
			100_000,
			&available_asset,
			10,
			100_0000,
			4,
			100,
			true
		);
		assert_eq!(10030, fees);
	}
}