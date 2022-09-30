
use std::{convert::TryInto, any::Any};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use serum_swap::anchor_lang::CpiContext;

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey, // Public key of the account the hello world program was loaded into
    accounts: &[AccountInfo], // The account to say hello to
    data: &[u8], 
) -> ProgramResult {
    msg!("Hello World Rust program entrypoint");

    // Iterating accounts is safer than indexing
    let accounts_iter = &mut accounts.iter();

    // Get the account to say hello to
    let market_a = next_account_info(accounts_iter)?;
    let request_queue_a = next_account_info(accounts_iter)?;
    let event_queue_a = next_account_info(accounts_iter)?;
    let bids_a = next_account_info(accounts_iter)?;
    let asks_a = next_account_info(accounts_iter)?;
    let coin_vault_a = next_account_info(accounts_iter)?;
    let pc_vault_a = next_account_info(accounts_iter)?;
    let vault_signer_a = next_account_info(accounts_iter)?;
    let open_orders_a = next_account_info(accounts_iter)?;
    let coin_wallet_a = next_account_info(accounts_iter)?;
    let pc_wallet_a = next_account_info(accounts_iter)?;
    let market_b = next_account_info(accounts_iter)?;
    let request_queue_b = next_account_info(accounts_iter)?;
    let event_queue_b = next_account_info(accounts_iter)?;
    let bids_b = next_account_info(accounts_iter)?;
    let asks_b = next_account_info(accounts_iter)?;
    let coin_vault_b = next_account_info(accounts_iter)?;
    let pc_vault_b = next_account_info(accounts_iter)?;
    let vault_signer_b = next_account_info(accounts_iter)?;
    let open_orders_b = next_account_info(accounts_iter)?;
    let coin_wallet_b = next_account_info(accounts_iter)?; 
    let authority = next_account_info(accounts_iter)?;
    let dex_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let swap_program_id = next_account_info(accounts_iter)?;
    let rent = next_account_info(accounts_iter)?;
    msg!("ici1");

    let (amount, rest1) = data.split_at(8);
    let amount = amount.try_into()
    .ok()
    .map(u64::from_le_bytes)
    .ok_or(ProgramError::InvalidArgument)?;

    let (from_decimals, rest2) = rest1.split_at(1);
               
    let from_decimals = from_decimals.try_into()
        .ok()
        .map(u8::from_le_bytes)
        .ok_or(ProgramError::InvalidArgument)?;

    let (quote_decimals, _rest3) = rest2.split_at(1);
               
    let quote_decimals = quote_decimals.try_into()
        .ok()
        .map(u8::from_le_bytes)
        .ok_or(ProgramError::InvalidArgument)?;

msg!("amount : {} , from_decimals : {} ,quote_decimals : {} ", amount,from_decimals,quote_decimals);

   /* let amount=400000000;
    let from_decimals:u8 = 8;
    let quote_decimals:u8 = 6;*/
    let rate:u64 =1 ;
       
    let cpi_accounts =  Box::new(serum_swap::cpi::accounts::SwapTransitive {
        from: serum_swap::cpi::accounts::MarketAccounts {
            market:market_a.clone(),
            open_orders: open_orders_a.clone(),
            request_queue: request_queue_a.clone(),
            event_queue: event_queue_a.clone(),
            bids: bids_a.clone(),
            asks: asks_a.clone(),
            order_payer_token_account: coin_wallet_a.clone(),   
            coin_vault:coin_vault_a.clone(),
            pc_vault: pc_vault_a.clone(),
            vault_signer:vault_signer_a.clone(),
            coin_wallet: coin_wallet_a.clone(),
        },
        to:serum_swap::cpi::accounts::MarketAccounts {
            market: market_b.clone(),
            open_orders: open_orders_b.clone(),
            request_queue: request_queue_b.clone(),
            event_queue: event_queue_b.clone(),
            bids: bids_b.clone(),
            asks: asks_b.clone(),
            order_payer_token_account: pc_wallet_a.clone(),
            coin_vault:coin_vault_b.clone(),
            pc_vault:pc_vault_b.clone(),
            vault_signer: vault_signer_b.clone(),
            coin_wallet:coin_wallet_b.clone(),
        },
        authority: authority.clone(),
        pc_wallet: pc_wallet_a.clone(),
        dex_program: dex_program.clone(),
        token_program: token_program.clone(),
        rent: rent.clone(),
    });

    let strict: bool = false;
    let min_exchange_rate = serum_swap::ExchangeRate {
        rate,
        from_decimals,
        quote_decimals,
        strict,
    };
    msg!("ici3");
    let cpi_ctx= CpiContext::new(swap_program_id.clone(),*cpi_accounts);
    msg!("ici4");
    serum_swap::cpi::swap_transitive(cpi_ctx, amount, min_exchange_rate)?;
    msg!("ici5");
    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;
    use std::mem;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<u32>()];
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data: Vec<u8> = Vec::new();

        let accounts = vec![account];

        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            0
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            1
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            2
        );
    }
}
