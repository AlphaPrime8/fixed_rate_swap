//

use anchor_lang::prelude::*;
use anchor_spl::token::{self, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;
use std::ops::Deref;

declare_id!("FroG6rb4BfRMNqfvzL3sML2MYGBjzbvC6nKrTQQheiYr");

#[program]
pub mod escrow {
    use super::*;

    const ESCROW_PDA_SEED: &[u8] = b"escrow";
    const STATE_PDA_SEED: &[u8] = b"state";

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        initializer_amount: u64,
        taker_rate: u64,
        bumps: StateBumps,
        state_seed_name: String,
    ) -> ProgramResult {

        // check if already initialized, and if so then throw custom error
        // confirm correct state_account is passed in
        let (pda, _bump_seed) = Pubkey::find_program_address(&[STATE_PDA_SEED], ctx.program_id);
        if pda.key() != *ctx.accounts.escrow_account.to_account_info().key {
            return Err(ErrorCode::InvalidStateAccount.into());
        }

        // add pda data to escrow
        let name_bytes = state_seed_name.as_bytes();
        let mut name_data = [b' '; 10];
        name_data[..name_bytes.len()].copy_from_slice(name_bytes);
        ctx.accounts.escrow_account.state_seed_name = name_data;
        ctx.accounts.escrow_account.bumps = bumps;

        // setup escrow state account
        ctx.accounts.escrow_account.initializer_key = *ctx.accounts.initializer.key;
        ctx.accounts
            .escrow_account
            .initializer_deposit_token_account = *ctx
            .accounts
            .initializer_deposit_token_account
            .to_account_info()
            .key;
        ctx.accounts
            .escrow_account
            .initializer_receive_token_account = *ctx
            .accounts
            .initializer_receive_token_account
            .to_account_info()
            .key;
        ctx.accounts.escrow_account.initializer_amount = initializer_amount;
        ctx.accounts.escrow_account.taker_rate = taker_rate;

        // transfer ownership of initializer_deposit_token_account to PDA
        let (pda, _bump_seed) = Pubkey::find_program_address(&[ESCROW_PDA_SEED], ctx.program_id);
        token::set_authority(ctx.accounts.into_set_deposit_token_context(), AuthorityType::AccountOwner, Some(pda))?;

        // transfer ownership of initializer_receive_token_account
        token::set_authority(ctx.accounts.into_set_receive_token_context(), AuthorityType::AccountOwner, Some(pda))?;

        Ok(())
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> ProgramResult {

        // lookup pda
        let (_pda, bump_seed) = Pubkey::find_program_address(&[ESCROW_PDA_SEED], ctx.program_id);
        let seeds = &[&ESCROW_PDA_SEED[..], &[bump_seed]];

        // transfer ownership of deposit token account back to initializer
        token::set_authority(
            ctx.accounts.into_set_deposit_authority_context().with_signer(&[&seeds[..]]),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.escrow_account.initializer_key),
        )?;

        // transfer ownership of receive token account back to initializer
        token::set_authority(
            ctx.accounts.into_set_receive_authority_context().with_signer(&[&seeds[..]]),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.escrow_account.initializer_key),
        )?;

        Ok(())
    }

    pub fn exchange(
        ctx: Context<Exchange>,
        swap_amount: u64,
    ) -> ProgramResult {
        // Transferring from initializer to taker
        let (_pda, bump_seed) = Pubkey::find_program_address(&[ESCROW_PDA_SEED], ctx.program_id);
        let seeds = &[&ESCROW_PDA_SEED[..], &[bump_seed]];

        let taker_amount: u64 = swap_amount * ctx.accounts.escrow_account.taker_rate;
        msg!("Swaping for total taker_amount: {}", taker_amount);

        token::transfer(
            ctx.accounts
                .into_transfer_to_taker_context()
                .with_signer(&[&seeds[..]]),
            taker_amount,
        )?;

        token::transfer(
            ctx.accounts.into_transfer_to_initializer_context(),
            swap_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(initializer_amount: u64, taker_rate: u64, bumps: StateBumps, state_seed_name: String)]
pub struct InitializeEscrow<'info> {
    #[account(signer)]
    pub initializer: AccountInfo<'info>,
    #[account(mut, constraint = initializer_deposit_token_account.amount >= initializer_amount)]
    pub initializer_deposit_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub initializer_receive_token_account: Account<'info, TokenAccount>,
    #[account(init,
    seeds = [state_seed_name.as_bytes()],
    bump = bumps.escrow_account,
    payer = initializer,
    space = 8 + EscrowAccount::LEN,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(swap_amount: u64)]
pub struct Exchange<'info> {
    #[account(signer)]
    pub taker: AccountInfo<'info>,
    #[account(mut)]
    pub taker_deposit_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub taker_receive_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pda_deposit_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub initializer_receive_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub initializer_main_account: AccountInfo<'info>, // TODO Get ride of this, ah cuz we close it...
    // removed this account param below: close = initializer_main_account
    #[account(
        mut,
        seeds = [escrow_account.state_seed_name.as_ref().trim_ascii_whitespace()],
        bump = escrow_account.bumps.escrow_account,
        constraint = swap_amount <= taker_deposit_token_account.amount,
        constraint = (escrow_account.taker_rate * swap_amount) <= pda_deposit_token_account.amount,
        constraint = escrow_account.initializer_deposit_token_account == *pda_deposit_token_account.to_account_info().key,
        constraint = escrow_account.initializer_receive_token_account == *initializer_receive_token_account.to_account_info().key,
        constraint = escrow_account.initializer_key == *initializer_main_account.key,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub pda_account: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    pub initializer: AccountInfo<'info>,
    #[account(mut)]
    pub pda_deposit_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pda_receive_token_account: Account<'info, TokenAccount>,
    pub pda_account: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [escrow_account.state_seed_name.as_ref().trim_ascii_whitespace()],
        bump = escrow_account.bumps.escrow_account,
        constraint = escrow_account.initializer_key == *initializer.key,
        constraint = escrow_account.initializer_deposit_token_account == *pda_deposit_token_account.to_account_info().key,
        close = initializer
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct EscrowAccount {
    pub initializer_key: Pubkey,
    pub initializer_deposit_token_account: Pubkey,
    pub initializer_receive_token_account: Pubkey,
    pub initializer_amount: u64,
    pub taker_rate: u64,
    pub state_seed_name: [u8; 10],
    pub bumps: StateBumps,
}

impl EscrowAccount {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 10 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct StateBumps {
    pub escrow_account: u8,
}

impl<'info> InitializeEscrow<'info> {
    fn into_set_deposit_token_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.initializer_deposit_token_account.to_account_info().clone(),
            current_authority: self.initializer.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> InitializeEscrow<'info> {
    fn into_set_receive_token_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.initializer_receive_token_account.to_account_info().clone(),
            current_authority: self.initializer.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
impl<'info> CancelEscrow<'info> {
    fn into_set_deposit_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.pda_deposit_token_account.to_account_info().clone(),
            current_authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> CancelEscrow<'info> {
    fn into_set_receive_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.pda_receive_token_account.to_account_info().clone(),
            current_authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> Exchange<'info> {
    fn into_transfer_to_taker_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.pda_deposit_token_account.to_account_info().clone(),
            to: self.taker_receive_token_account.to_account_info().clone(),
            authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> Exchange<'info> {
    fn into_transfer_to_initializer_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.taker_deposit_token_account.to_account_info().clone(),
            to: self
                .initializer_receive_token_account
                .to_account_info()
                .clone(),
            authority: self.taker.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[error]
pub enum ErrorCode {
    #[msg("Invalid State Account.")]
    InvalidStateAccount,
}

/// Trait to allow trimming ascii whitespace from a &[u8].
pub trait TrimAsciiWhitespace {
    /// Trim ascii whitespace (based on `is_ascii_whitespace()`) from the
    /// start and end of a slice.
    fn trim_ascii_whitespace(&self) -> &[u8];
}

impl<T: Deref<Target = [u8]>> TrimAsciiWhitespace for T {
    fn trim_ascii_whitespace(&self) -> &[u8] {
        let from = match self.iter().position(|x| !x.is_ascii_whitespace()) {
            Some(i) => i,
            None => return &self[0..0],
        };
        let to = self.iter().rposition(|x| !x.is_ascii_whitespace()).unwrap();
        &self[from..=to]
    }
}
