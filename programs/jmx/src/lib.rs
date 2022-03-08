use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, Mint, MintTo, Token, TokenAccount, Transfer};
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants;
pub mod context;
pub mod types;
use types::ProgramResult;
use crate::context::*;
use crate::constants::EXCHANGE_AUTHORITY_SEED;


#[program]
pub mod jmx {
    use super::*;
    pub fn initialize_exchange(ctx: Context<InitializeExchange>, exchange_name: String, bumps: ExchangeBumps) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        let name_bytes = exchange_name.as_bytes();
        let mut name_data = [b' '; 20];
        name_data[..name_bytes.len()].copy_from_slice(name_bytes);

        msg!("bumps {:?}", bumps.exchange_authority);
        exchange.tax_basis_points = 8;
        exchange.bumps = bumps;
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
        msg!("bumps after {:?}", exchange.bumps.exchange_authority);

        Ok(())
    }

    pub fn update_asset_whitelist(ctx: Context<UpdateAssetWhitelist>, en: String, assets: Vec<Pubkey>) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        exchange.assets = assets;
        Ok(())
    }
    
    // Should throw an error if someone tries to init an already initialized available asset account or an already init-ed token account for that asset
    pub fn initialize_available_asset(ctx: Context<InitializeAvailableAsset>, exchange_name: String, asset_name: String, asset_data: AvailableAsset) -> ProgramResult {
        let asset = &mut ctx.accounts.available_asset;
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
        msg!("token decimals {}", asset.token_decimals);
        Ok(())
    }

    pub fn init_lp_ata(ctx: Context<InitializeLpAta>) -> ProgramResult {
        Ok(())
    }

    pub fn mint_lp_token(ctx: Context<MintLpToken>, exchange_name: String, asset_name: String, lamports: u64) -> ProgramResult {
        // get exchange's token account
        let token_account = &ctx.accounts.exchange_reserve_token;
        // check supply on token account
        let supply = token_account.amount;
        // transfer lamports from user to reserve_asset_token_acount
        token::transfer(
            ctx.accounts.into_transfer_context(),
            lamports as u64,
        )?;
        // get price of lp token
        // get price of asset to deposit
        // find fx rate of asset to deposit and lp token
        // mint lp token to user
        // let exchange_name = ctx.accounts.exchange.name.as_ref();
        // let seeds = exchange_authority_seeds!(
        //     exchange_name = exchange_name,
        //     bump = ctx.accounts.exchange.bumps.exchange_authority
        // );
        // let signer = &[&seeds[..]];
        // // FIX: Need to update lamports to actual amount calcuated with fx rate
        // token::mint_to(ctx.accounts.into_mint_to_context(signer), lamports)?;

        // update reserve amounts on available asset
        Ok(())
    }
}

// #[macro_export]
// macro_rules! exchange_authority_seeds {
//     (
//         exchange_name = $exchange_name:expr,
//         bump = $bump:expr
//     ) => {
//         &[
//             EXCHANGE_AUTHORITY_SEED.as_bytes(),
//             $exchange_name.strip(),
//             &[$bump],
//         ]
//     };
// }
