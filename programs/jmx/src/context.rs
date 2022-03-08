use solana_program::clock::{Slot};
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;


#[derive(Accounts)]
#[instruction(exchange_name: String)]
pub struct InitializeExchange<'info> {
    // exchange Authority accounts
    #[account(mut)]
    pub exchange_admin: Signer<'info>,
    // exchange Accounts
    #[account(
        init,
        seeds = [exchange_name.as_bytes()],
        bump,
        payer = exchange_admin,
				space = Exchange::LEN,
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
        mint::decimals = 8 as u8,
        mint::authority = exchange_authority,
        seeds = [LP_MINT_SEED.as_bytes(), exchange_name.as_bytes()],
        bump,
        payer = exchange_admin
    )]
    pub lp_mint: Box<Account<'info, Mint>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(exchange_name: String)]
pub struct UpdateAssetWhitelist<'info> {
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
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

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
			token::authority = exchange_admin,
			seeds = [asset_name.as_bytes(), exchange_name.as_bytes()],
			bump,
			payer = exchange_admin
		)]
		pub exchange_reserve_token: Box<Account<'info, TokenAccount>>,
		#[account()]
    pub mint: Box<Account<'info, Mint>>,
		/// CHECK: not sure what type the authority should be, so keeping as unchecked account
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(exchange_name: String)]
pub struct InitializeLpAta<'info> {
    // exchange Authority accounts
    #[account(
			mut		
		)]
    pub user: Signer<'info>,
    // exchange Accounts
    #[account(
				mut,
        seeds = [exchange_name.as_bytes()],
        bump,
    )]
		pub exchange: Box<Account<'info, Exchange>>,
				#[account(
			mut,
			seeds = [EXCHANGE_AUTHORITY_SEED.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		/// CHECK: Authority account, might not need another check
		pub exchange_authority: UncheckedAccount<'info>,
		#[account()]
    pub lp_mint: Box<Account<'info, Mint>>,
		/// CHECK: not sure what type the authority should be, so keeping as unchecked account
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// need to check that the mint provided matches the redeemable mint
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

#[account]
#[derive(Default)]
pub struct Exchange {
	/// account that can make changes to the exchange
	pub name: [u8; 20],
	/// assets that can be traded/minted on the exchange
	pub assets: Vec<Pubkey>,
	/// fee for non-stable asset perp
	pub tax_basis_points: u64,
	/// fee for stable asset perp
	pub stable_tax_basis_points: u64,
	/// base fee for mint/burning lp token
	pub mint_burn_basis_points: u64,
	/// base fee for swap
	pub swap_fee_basis_points: u64,
	/// base fee for swaping between stable assets 
	pub stable_swap_fee_basis_points: u64, 
	/// references position fees, not for funding rate, nor for getting in/out of a position
	pub margin_fee_basis_points: u64, 
	/// fee for getting liquidated, goes to liquidator in USD
	pub liquidation_fee_usd: u64,
	/// prevents gaming of oracle with hourly trades
	pub min_profit_time: u64,
	/// cache the total weights of the assets	
	pub total_weights: u64,
	/// account that can make changes to the exchange
	pub admin: Pubkey,
	/// bumps needed for future signatures
	pub bumps: ExchangeBumps
}

/// Represents whitelisted assets on the dex
#[account]
#[derive(Default)]
pub struct AvailableAsset {
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
	pub net_protocol_liabilities: u64
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct ExchangeBumps {
	pub exchange_authority: u8,
}


impl Exchange {
	const LEN: usize = 32 * 20 
	+ (8 * SMALL_UINTS_IN_EXCHANGE as usize)
	+ 32;
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