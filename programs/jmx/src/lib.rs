use anchor_lang::prelude::*;
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants;
pub mod context;
pub mod types;
use types::ProgramResult;
use crate::context::*;


#[program]
pub mod jmx {

    use super::*;
    pub fn initialize_exchange(ctx: Context<InitializeExchange>, exchange_name: String) -> ProgramResult {
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

    pub fn update_asset_whitelist(ctx: Context<UpdateAssetWhitelist>, exchange_name: String, assets: Vec<Pubkey>) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        exchange.assets = assets;
        Ok(())
    }
}
