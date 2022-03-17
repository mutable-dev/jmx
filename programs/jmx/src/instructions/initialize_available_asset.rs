use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_lang::prelude::*;
use crate::*;
use crate::constants::EXCHANGE_AUTHORITY_SEED;

#[derive(Accounts)]
#[instruction(exchange_name: String, asset_name: String, available_asset: AvailableAsset)]
pub struct InitializeAvailableAsset<'info> {
    // exchange Authority accounts
    #[account(
			mut,
			constraint = exchange_admin.key() == exchange.admin
		)]
    pub exchange_admin: Signer<'info>,
    // exchange Accounts
    #[account(
				mut,
        seeds = [exchange_name.as_bytes()],
        bump,
    )]
		pub exchange: Box<Account<'info, Exchange>>,
		/// CHECK: this is our authority, no checked account required
		#[account(
			mut,
			seeds = [EXCHANGE_AUTHORITY_SEED.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		pub exchange_authority: UncheckedAccount<'info>,
		#[account(
			init,
			seeds = [exchange_name.as_bytes(), asset_name.as_bytes()],
			bump,
			payer = exchange_admin,
		)]
		pub available_asset: Account<'info, AvailableAsset>,
		#[account(
			init,
			token::mint = mint,
			token::authority = exchange_authority,
			seeds = [asset_name.as_bytes(), exchange_name.as_bytes()],
			bump,
			payer = exchange_admin
		)]
		pub exchange_reserve_token: Box<Account<'info, TokenAccount>>,
		#[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
		/// CHECK: not sure what type the authority should be, so keeping as unchecked account
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// Should throw an error if someone tries to init an already initialized available asset account or an already init-ed token account for that asset
pub fn handler(ctx: Context<InitializeAvailableAsset>, exchange_name: String, asset_name: String, asset_data: AvailableAsset) -> ProgramResult {
	let asset = &mut ctx.accounts.available_asset;
	msg!("ctx.accounts.mint.key() {:?} asset_data.mint_address {:?}", ctx.accounts.mint.key(), asset_data.mint_address );
	assert!(ctx.accounts.mint.key() == asset_data.mint_address, "Mints are not same");

	asset.mint_address = ctx.accounts.mint.key();
	asset.token_decimals = asset_data.token_decimals;
	asset.min_profit_basis_points = asset_data.min_profit_basis_points;
	asset.max_lptoken_amount = asset_data.max_lptoken_amount;
	asset.stable_token = asset_data.stable_token;
	asset.shortable_token = asset_data.shortable_token;
	asset.cumulative_funding_rate = 0;
	// Need to set time to current time with clock
	asset.last_funding_time = asset_data.last_funding_time;
	asset.oracle_address = asset_data.oracle_address;
	asset.backup_oracle_address = asset_data.backup_oracle_address;
	asset.global_short_size = 0;
	asset.net_protocol_liabilities = 0; 
	asset.token_weight = asset_data.token_weight;
	asset.occupied_reserves = 0;
	asset.fee_reserves = 0;
	asset.pool_reserves = 0;

	let exchange = &mut ctx.accounts.exchange;
	exchange.total_weights += asset.token_weight;

	Ok(())
}