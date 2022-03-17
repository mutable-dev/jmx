use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
// PDA seeds owner, is_long, collateral_mint, delivery_asset
pub struct Position {
	/// The user account address that owns the position
	pub owner: Pubkey,
	/// The address of the collateral that was use to open the position 
	pub collateral_mint: Pubkey,
	/// The size of the position in the tokens decimals
	pub size: u64,
	/// The average price paid to open
	/// This value is normalized with PRICE_DECIMALS and is ALWAYS in USD
	pub average_price: u64,
	/// how much of the delivery asset is reserved
	/// In the delivery asset's Mint decimals 
	pub reserve_amount: u64,
	/// Entry number that is compared to ever increasing number cumulative 
	pub entry_funding_rate: u64,
	/// Funding rates to determine the owed funding fees
	pub realized_pnl: u64, 
	/// Only used when reducing collateral
	pub in_profit: bool,
	/// Keeps track of the the last time fees were calculated for the position
	pub last_increased_time: i64, //i64
}