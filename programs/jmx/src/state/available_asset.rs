use anchor_lang::prelude::*;

/// Represents whitelisted assets on the dex
#[account]
#[derive(Default)]
pub struct AvailableAsset {
		/// Mint address of the available asset
	pub mint_address: Pubkey,
	/// the decimals for the token
	pub token_decimals: u64,
	/// The weight of this token in the LP 
	pub token_weight: u64,
	/// min about of profit a position needs to be in to take profit before time
	pub min_profit_basis_points: u64,
	/// maximum amount of this token that can be in the pool
	pub max_lptoken_amount: u64,
	/// Flag for whether this is a stable token
	pub stable_token: bool,
	/// Flag for whether this asset is shortable
	pub shortable_token: bool,
	/// The cumulative funding rate for the asset
	pub cumulative_funding_rate: u64,
	/// Last time the funding rate was updated
	pub last_funding_time: u64,
	/// Account with price oracle data on the asset
	pub oracle_address: Pubkey,
	/// Backup account with price oracle data on the asset
	pub backup_oracle_address: Pubkey,
	/// Global size of shorts denominated in kind
	pub global_short_size: u64,
	/// Represents the total outstanding obligations of the protocol (position - size) for the asset
	pub net_protocol_liabilities: u64,
	/// Assets that are reserved and having positions trading against them
	pub occupied_assets: u64,
	/// Represents how much in reserves the pool owns of the available asset from fees
	pub fee_reserves: u64,
	/// Represents the unoccupied + occupied amount of assets in the pool for trading 
	/// does not include fee_reserves
	pub pool_reserves: u64,

}