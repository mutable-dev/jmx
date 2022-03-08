use anchor_spl::token::{Mint, Token};
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

pub fn handler(ctx: Context<InitializeExchange>, exchange_name: String) -> ProgramResult {
	let exchange = &mut ctx.accounts.exchange;
	let name_bytes = exchange_name.as_bytes();
	let mut name_data = [b' '; 20];
	name_data[..name_bytes.len()].copy_from_slice(name_bytes);

	exchange.tax_basis_points = 8;
	exchange.stable_tax_basis_points = 4;
	exchange.mint_burn_basis_points = 15;
	exchange.swap_fee_basis_points = 30; 
	exchange.stable_swap_fee_basis_points = 8;
	exchange.margin_fee_basis_points = 1;
	exchange.liquidation_fee_usd = 40;
	exchange.min_profit_time = 15;
	exchange.total_weights = 60;
	exchange.admin = ctx.accounts.exchange_admin.key();
	exchange.name = name_data;

	Ok(())
}

impl Exchange {
	const LEN: usize = 32 * 20 
	+ (8 * SMALL_UINTS_IN_EXCHANGE as usize)
	+ 32;
}
