/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Account,
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import fs from 'mz/fs';
import path from 'path';
import * as borsh from 'borsh';
//@ts-ignore
import * as BufferLayout from 'buffer-layout';

import { u64 } from "./u64";
import {getPayer, getRpcUrl, createKeypairFromFile} from './utils';

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Keypair associated to the fees' payer
 */
let payer: Keypair;

/**
 * Hello world's program id
 */
let programId: PublicKey;

/**
 * The public key of the account we are saying hello to
 */
let greetedPubkey: PublicKey;

/**
 * Path to program files
 */
const PROGRAM_PATH = path.resolve(__dirname, '../../dist/program');

/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running either:
 *   - `npm run build:program-c`
 *   - `npm run build:program-rust`
 */
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, 'helloworld.so');

/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy dist/program/helloworld.so`
 */
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'helloworld-keypair.json');

/**
 * The state of a greeting account managed by the hello world program
 */
class GreetingAccount {
  counter = 0;
  constructor(fields: {counter: number} | undefined = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

/**
 * Borsh schema definition for greeting accounts
 */
const GreetingSchema = new Map([
  [GreetingAccount, {kind: 'struct', fields: [['counter', 'u32']]}],
]);

/**
 * The expected size of each greeting account.
 */
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount(),
).length;

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  const rpcUrl = await getRpcUrl();
  connection = new Connection(rpcUrl, 'confirmed');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', rpcUrl, version);
}

/**
 * Establish an account to pay for everything
 */
export async function establishPayer(): Promise<void> {
  let fees = 0;
  if (!payer) {
    const {feeCalculator} = await connection.getRecentBlockhash();

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag

    payer = await getPayer();
  }

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
  );
}

/**
 * Check if the hello world BPF program has been deployed
 */
export async function checkProgram(): Promise<void> {
  // Read program id from keypair file
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``,
    );
  }

  // Check if the program has been deployed
  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        'Program needs to be deployed with `solana program deploy dist/program/helloworld.so`',
      );
    } else {
      throw new Error('Program needs to be built and deployed');
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }
  console.log(`Using program ${programId.toBase58()}`);

  // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
  const GREETING_SEED = 'hello';
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    GREETING_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      'Creating account',
      greetedPubkey.toBase58(),
      'to say hello to',
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: GREETING_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
}


/**
 * Layout for a 64bit unsigned value
 */
 export const uint64 = (property: string = 'uint64'): Object => {
  return BufferLayout.blob(8, property);
};

/**
 * Say hello
 */
export async function sayHello(): Promise<void> {
  console.log('Saying hello to', greetedPubkey.toBase58());

/*
  let marketA = new PublicKey("3tJDRWYaZdge1bYAAsf3bhytx8rRQXX7eWubeyZzNHJp");
  let requestQueueA =new PublicKey("ArmA65w38UUcbbZQ8zJxWpqkm1qmTJ7cS7WKCBqwqBgT"); 
  let eventQueueA = new PublicKey("C26G4V2a18gFcD7nUhhHmSRjGs55tu9P1E2AfvVVfafp"); 
  let bidsA = new PublicKey("8CpfYGUkQfeNSJ6d5HMoiWg8ZdZo94pB4tsjfvjzs9mk");
  let asksA = new PublicKey("5MLt749GqH5c4GHBE6exYq966DBX1qHW6eWbMirm2nJM"); 
  let coinVaultA = new PublicKey("DMviRkT4hKQyCpGUFRoLLWDHGH93HcKLoieTpP7VDW4Y")  ;
  let pcVaultA =new PublicKey("GND1hEWgtgDqZEc3sJtsiLMNNqyEUkttCXYuErbb4KWS"); 
  let vaultSignerA = new PublicKey("JCd3txYHnPaXcR3GcypfBYK1LKwMyaBY3Tk4ZUEf7nkb");
  let openOrdersA = new PublicKey("GPLxnhJw3TfGvHNThi7qkMb45rr1UtYUdj5gwzLagQ8w"); 
  let orderPayerTokenAccountA = new PublicKey("A1WTabM8hawUMuCLPedmtHH354sA2huJzCjqqweiQqqB"); 
  let coinWalletA =  new PublicKey("A1WTabM8hawUMuCLPedmtHH354sA2huJzCjqqweiQqqB"); 
  let pcWalletA = new PublicKey("CAZNLw7mX7RCj4Z8Qxa68FHZAKTMJkxpdewK2tK5vejn");
  let marketB = new PublicKey("4uvRJdXtT4bEGCfryp6x9aTu39suwxTeCJVwmvPZttdZ"); 
  let requestQueueB = new PublicKey("AFsUmcSDicr8ud7MUqAhXebFGqhB5Ge3yFs3ehw4aBmj"); 
  let eventQueueB = new PublicKey("CTGx69ztsFPbr6rHULpEpbN4KCxzx6qH5eekLoDoY1SZ"); 
  let bidsB = new PublicKey("9mgpqB54eA2hFzCYpX64CAmT19FSa9PbRb1x3fcbPDKW");
  let asksB = new PublicKey("CDSpsaEamFazb2mxdeGfs4zw6EcSvuqtgX6RxJcVKqgV"); 
  let coinVaultB = new PublicKey("5r4MmvDHH4VnvfjURqemTuLi7xqbEtPPcQ7hVeGkPkvA"); 
  let pcVaultB = new PublicKey("49t75CVS8BA7apNAzuq7Diw4od3rLfoAZ94MRh4UQXdd");
  let vaultSignerB = new PublicKey("AVjXDyRHiR5qCBQkX8K8cuGPnN19iVmzzj5xBhJMPRcW");
  let openOrdersB = new PublicKey("DsDJY5REmTAQtEru2qVNrXj6ux1T1Xp7T7a5Gcm167Mj"); 
  let orderPayerTokenAccountB=  new PublicKey("CAZNLw7mX7RCj4Z8Qxa68FHZAKTMJkxpdewK2tK5vejn");
  let coinWalletB =  new PublicKey("GNVQLcKdAVEjMha7krvbTtC2qKukcDWVBNVGtE3wJLJd"); 
  let pcWalletB = new PublicKey("CAZNLw7mX7RCj4Z8Qxa68FHZAKTMJkxpdewK2tK5vejn");
  let authority = new PublicKey("EnHBYsRckMqtAkpfXhhRTpCo3XF5CFgywXyktqMYoJcV");
  let dexProgram = new PublicKey("7RA6GmbCYRBB66QfuDa1peHAE2fWDbeR7Vr2sGmNtGFC");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("CxXDXjGBJ6RwMKKLqkd9KCAR5yfswNd8iXcQPmFFeDvU");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
 */

/*
// mainnet : SRMUSDC => WSOLUSDC , amount 6
let marketA = new PublicKey("ByRys5tuUWDgL73G8JBAEfkdFf8JWBzPBDHsBVQ5vbQA");
  let requestQueueA =new PublicKey("Hr8Z93aWe4hhJbC5i7YTsPaSToziVh3vyMfv9GRqKFCh"); 
  let eventQueueA = new PublicKey("6o44a9xdzKKDNY7Ff2Qb129mktWbsCT4vKJcg2uk41uy"); 
  let bidsA = new PublicKey("AuL9JzRJ55MdqzubK4EutJgAumtkuFcRVuPUvTX39pN8");
  let asksA = new PublicKey("8Lx9U9wdE3afdqih1mCAXy3unJDfzSaXFqAvoLMjhwoD"); 
  let coinVaultA = new PublicKey("Ecfy8et9Mft9Dkavnuh4mzHMa2KWYUbBTA5oDZNoWu84")  ;
  let pcVaultA =new PublicKey("hUgoKy5wjeFbZrXDW4ecr42T4F5Z1Tos31g68s5EHbP"); 
  let vaultSignerA = new PublicKey("GVV4ZT9pccwy9d17STafFDuiSqFbXuRTdvKQ1zJX6ttX");
  let openOrdersA = new PublicKey("LQUo7grp8xVgaCdPYemMP6pAychxfhgmahHxbdWw7Fn"); 
  let orderPayerTokenAccountA = new PublicKey("5UMsucnZ2q3gPtzxz7uanSDZtxxVP1VaxzJw5UFjMqkT"); 
  let coinWalletA =  new PublicKey("5UMsucnZ2q3gPtzxz7uanSDZtxxVP1VaxzJw5UFjMqkT"); 
  let pcWalletA = new PublicKey("CecTQUZshhrwPUg1omH6Dwtprmpa2Yunmtj1AHPshE68");
  let marketB = new PublicKey("9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"); 
  let requestQueueB = new PublicKey("AZG3tFCFtiCqEwyardENBQNpHqxgzbMw8uKeZEw2nRG5"); 
  let eventQueueB = new PublicKey("5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht"); 
  let bidsB = new PublicKey("14ivtgssEBoBjuZJtSAPKYgpUK7DmnSwuPMqJoVTSgKJ");
  let asksB = new PublicKey("CEQdAFKdycHugujQg9k2wbmxjcpdYZyVLfV9WerTnafJ"); 
  let coinVaultB = new PublicKey("36c6YqAwyGKQG66XEp2dJc5JqjaBNv7sVghEtJv4c7u6"); 
  let pcVaultB = new PublicKey("8CFo8bL8mZQK8abbFyypFMwEDd8tVJjHTTojMLgQTUSZ");
  let vaultSignerB = new PublicKey("F8Vyqk3unwxkXukZFQeYyGmFfTG3CAX4v24iyrjEYBJV");
  let openOrdersB = new PublicKey("9aWMQf2K5T87pdjJKJLJ7Z83oqe11y7fLQb5pj55iFjq"); 
  let orderPayerTokenAccountB=  new PublicKey("CecTQUZshhrwPUg1omH6Dwtprmpa2Yunmtj1AHPshE68");
  let coinWalletB =  new PublicKey("89n5JzdkgFZ7rA2ELnYCB4m5YaB9uHpiDWbzj3BShno3"); 
  let pcWalletB = new PublicKey("CecTQUZshhrwPUg1omH6Dwtprmpa2Yunmtj1AHPshE68");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");

 */

  /*

  // mainnet :  RAYUSDT =>SRMUSDT , amount : 3
  marketA : teE55QrL4a4QSfydR9dnHF97jgCfptpuigbb53Lo95g 
  requestQueueA : 8RrrYN9WtASWGv9KfC5maF6AKxT6GSCikZ8SkSaimGZa 
  eventQueueA : 58KcficuUqPDcMittSddhT8LzsPJoH46YP4uURoMo5EB 
  bidsA :  AvKStCiY8LTp3oDFrMkiHHxxhxk4sQUWnGVcetm4kRpy 
  asksA : Hj9kckvMX96mQokfMBzNCYEYMLEBYKQ9WwSc1GxasW11 
  coinVaultA : 2kVNVEgHicvfwiyhT2T51YiQGMPFWLMSp8qXc1hHzkpU  
  pcVaultA : 5AXZV7XfR7Ctr6yjQ9m9dbgycKeUXWnWqHwBTZT6mqC7 
  vaultSignerA : HzWpBN6ucpsA9wcfmhLAFYqEUmHjE9n2cGHwunG5avpL 
  openOrdersA : 6JxDWtLczjhNzHZpEoQbNcr37hBiiyqGV4dFVRwomr2A 
  orderPayerTokenAccountA :  6PiCWPpzphFCRbMCGLBte7wiecKL5CKKK9ES6LhM94BU 
  coinWalletA :  6PiCWPpzphFCRbMCGLBte7wiecKL5CKKK9ES6LhM94BU 
  pcWalletA : 7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z
marketB : AtNnsY1AyRERWJ8xCskfz38YdvruWVJQUVXgScC1iPb 
requestQueueB : Fco71o9xtvfvveoWsM7zXfKWf2YVcxtoy6rUvyB2MTuQ 
eventQueueB : 2i34Kriz23ZaQaJK6FVhzkfLhQj8DSqdQTmMwz4FF9Cf 
bidsB :  EE2CYFBSoMvcUR9mkEF6tt8kBFhW9zcuFmYqRM9GmqYb 
asksB : nkNzrV3ZtkWCft6ykeNGXXCbNSemqcauYKiZdf5JcKQ 
coinVaultB : GxPFMyeb7BUnu2mtGV2Zvorjwt8gxHqwL3r2kVDe6rZ8  
pcVaultB : 149gvUQZeip4u8bGra5yyN11btUDahDVHrixzknfKFrL 
vaultSignerB : 4yWr7H2p8rt11QnXb2yxQF3zxSdcToReu5qSndWFEJw 
openOrdersB : 6XnjD7uJzoH9JdjoF8EgXt8RFf7CmvjRZ3d2j52nwcEs 
orderPayerTokenAccountB :  7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z 
coinWalletB :  Hnr8uiJnX8wozX9a2GjxAo8tLAZsEGPxnEdGnumAeu6X 
pcWalletB : 7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z 
authority :  31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z 
dexProgram : 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin 
TOKEN_PROGRAM_ID :  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA 
swapProgramId : 22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD 
rent :  SysvarRent111111111111111111111111111111111 
programAddress : HrXDdj5WXpd1dqwqy9yL8f5gpNvePNxPA5XkLjDjrA4o 
createAccountProgram :  GuX9G3ce8BjmVGpNMCesDivStCX2yY7Jg26o3AZ8UJaC


  */



  /*

  // mainnet :  RAYUSDT =>SRMUSDT , amount : 3
  let marketA = new PublicKey("teE55QrL4a4QSfydR9dnHF97jgCfptpuigbb53Lo95g");
  let requestQueueA =new PublicKey("8RrrYN9WtASWGv9KfC5maF6AKxT6GSCikZ8SkSaimGZa"); 
  let eventQueueA = new PublicKey("58KcficuUqPDcMittSddhT8LzsPJoH46YP4uURoMo5EB"); 
  let bidsA = new PublicKey("AvKStCiY8LTp3oDFrMkiHHxxhxk4sQUWnGVcetm4kRpy");
  let asksA = new PublicKey("Hj9kckvMX96mQokfMBzNCYEYMLEBYKQ9WwSc1GxasW11"); 
  let coinVaultA = new PublicKey("2kVNVEgHicvfwiyhT2T51YiQGMPFWLMSp8qXc1hHzkpU")  ;
  let pcVaultA =new PublicKey("5AXZV7XfR7Ctr6yjQ9m9dbgycKeUXWnWqHwBTZT6mqC7"); 
  let vaultSignerA = new PublicKey("HzWpBN6ucpsA9wcfmhLAFYqEUmHjE9n2cGHwunG5avpL");
  let openOrdersA = new PublicKey("6JxDWtLczjhNzHZpEoQbNcr37hBiiyqGV4dFVRwomr2A"); 
  let orderPayerTokenAccountA = new PublicKey("6PiCWPpzphFCRbMCGLBte7wiecKL5CKKK9ES6LhM94BU"); 
  let coinWalletA =  new PublicKey("6PiCWPpzphFCRbMCGLBte7wiecKL5CKKK9ES6LhM94BU"); 
  let pcWalletA = new PublicKey("7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z");
  let marketB = new PublicKey("AtNnsY1AyRERWJ8xCskfz38YdvruWVJQUVXgScC1iPb"); 
  let requestQueueB = new PublicKey("Fco71o9xtvfvveoWsM7zXfKWf2YVcxtoy6rUvyB2MTuQ"); 
  let eventQueueB = new PublicKey("2i34Kriz23ZaQaJK6FVhzkfLhQj8DSqdQTmMwz4FF9Cf"); 
  let bidsB = new PublicKey("EE2CYFBSoMvcUR9mkEF6tt8kBFhW9zcuFmYqRM9GmqYb");
  let asksB = new PublicKey("nkNzrV3ZtkWCft6ykeNGXXCbNSemqcauYKiZdf5JcKQ"); 
  let coinVaultB = new PublicKey("GxPFMyeb7BUnu2mtGV2Zvorjwt8gxHqwL3r2kVDe6rZ8"); 
  let pcVaultB = new PublicKey("149gvUQZeip4u8bGra5yyN11btUDahDVHrixzknfKFrL");
  let vaultSignerB = new PublicKey("4yWr7H2p8rt11QnXb2yxQF3zxSdcToReu5qSndWFEJw");
  let openOrdersB = new PublicKey("6XnjD7uJzoH9JdjoF8EgXt8RFf7CmvjRZ3d2j52nwcEs"); 
  let orderPayerTokenAccountB=  new PublicKey("7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z");
  let coinWalletB =  new PublicKey("Hnr8uiJnX8wozX9a2GjxAo8tLAZsEGPxnEdGnumAeu6X"); 
  let pcWalletB = new PublicKey("7zT4D4Fk4esgMK9tn5egRSfdeCUnGBtAPGkXzR81Jx7z");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
  
*/


/*

NOVAUSDC => WSOLUSDC  ( amount : 22 , decimal : 9=> 6) : ERR 12e => amount unsuffisant

let marketA = new PublicKey("2awwFbLKpdD6xkRQgL5iPeyqfwGcVZ6HLZsyEUbVmt4y");
  let requestQueueA =new PublicKey("EVTHFYoJ23M5LqzrZPiLb9TtYKiS96vpA5rykEQKwR1P"); 
  let eventQueueA = new PublicKey("PG2uT1p3bj7REDuuRJtiewj9hXw9B9ZS5wL4HrxGCx4"); 
  let bidsA = new PublicKey("B5mQjV9LH7JbQDCUyVv45DnrhN6fx29as6BnzfycHtNY");
  let asksA = new PublicKey("AXrbvLmZkm6BEyFpQHSF8KYsLYRkXyRCgYDHspuWNgHT"); 
  let coinVaultA = new PublicKey("6vgeDbCJNwvsAnUPZPQg8LJQj3PAjfKjbN9QxZMPx8Qp")  ;
  let pcVaultA =new PublicKey("6S7ZwqyrnUecBhzoKKbJdaykKVAXLprbfk7aMxQMJ67j"); 
  let vaultSignerA = new PublicKey("6Nuytrm9iwaW2DKP9GN2MrnXzAeZaz4EWEBTaK316g36");
  let openOrdersA = new PublicKey("cQd4ZgnTbpaDY4DpDZpCcpqxLbFm835Un6nrFEDyZkH"); 
  let orderPayerTokenAccountA = new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let coinWalletA =  new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let pcWalletA = new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let marketB = new PublicKey("9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"); 
  let requestQueueB = new PublicKey("AZG3tFCFtiCqEwyardENBQNpHqxgzbMw8uKeZEw2nRG5"); 
  let eventQueueB = new PublicKey("5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht"); 
  let bidsB = new PublicKey("14ivtgssEBoBjuZJtSAPKYgpUK7DmnSwuPMqJoVTSgKJ");
  let asksB = new PublicKey("CEQdAFKdycHugujQg9k2wbmxjcpdYZyVLfV9WerTnafJ"); 
  let coinVaultB = new PublicKey("36c6YqAwyGKQG66XEp2dJc5JqjaBNv7sVghEtJv4c7u6"); 
  let pcVaultB = new PublicKey("8CFo8bL8mZQK8abbFyypFMwEDd8tVJjHTTojMLgQTUSZ");
  let vaultSignerB = new PublicKey("F8Vyqk3unwxkXukZFQeYyGmFfTG3CAX4v24iyrjEYBJV");
  let openOrdersB = new PublicKey("cUnDp1d6giK4YwAe4vcs4mHhBmKk47pNiQoT9MfeEGE"); 
  let orderPayerTokenAccountB=  new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let coinWalletB =  new PublicKey("jHRzBRic3uK7HUtxcsUtcjyMjVsQASbemNd38jPyKxK"); 
  let pcWalletB = new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");

*/

/*

  // NOVAUSDC => GMTUSDC  ( amount : 4 , decimal : 9=> 6) : err : 12e 

  let marketA = new PublicKey("2awwFbLKpdD6xkRQgL5iPeyqfwGcVZ6HLZsyEUbVmt4y");
  let requestQueueA =new PublicKey("EVTHFYoJ23M5LqzrZPiLb9TtYKiS96vpA5rykEQKwR1P"); 
  let eventQueueA = new PublicKey("PG2uT1p3bj7REDuuRJtiewj9hXw9B9ZS5wL4HrxGCx4"); 
  let bidsA = new PublicKey("B5mQjV9LH7JbQDCUyVv45DnrhN6fx29as6BnzfycHtNY");
  let asksA = new PublicKey("AXrbvLmZkm6BEyFpQHSF8KYsLYRkXyRCgYDHspuWNgHT"); 
  let coinVaultA = new PublicKey("6vgeDbCJNwvsAnUPZPQg8LJQj3PAjfKjbN9QxZMPx8Qp")  ;
  let pcVaultA =new PublicKey("6S7ZwqyrnUecBhzoKKbJdaykKVAXLprbfk7aMxQMJ67j"); 
  let vaultSignerA = new PublicKey("6Nuytrm9iwaW2DKP9GN2MrnXzAeZaz4EWEBTaK316g36");
  let openOrdersA = new PublicKey("cQd4ZgnTbpaDY4DpDZpCcpqxLbFm835Un6nrFEDyZkH"); 
  let orderPayerTokenAccountA = new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let coinWalletA =  new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let pcWalletA = new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let marketB = new PublicKey("B9HfUpFYPTiCdeGAb79BpJPsJi9mQUkDfSrQBqZh8MBT"); 
  let requestQueueB = new PublicKey("65L6WAMFXtx8o22ifRmuoSdtJP6jKHvJ5GS3FnnB4TXg"); 
  let eventQueueB = new PublicKey("5ez6LguttnWfh5yZ8wWhSKFbvScy7fDReQo6dxisoDzW"); 
  let bidsB = new PublicKey("DscAuvngnKtoQxNmA3LdRVDxmt98tuJyt1r2eXsqgMCh");
  let asksB = new PublicKey("BTG4BYpHtDqSYvx6UU6sngavnxYBushpG4fExeytzjbC"); 
  let coinVaultB = new PublicKey("14QK32hhgvSo8DT6CccL6RZ5dDaKPZfuHVNPHP5kN4Ud"); 
  let pcVaultB = new PublicKey("F5sZdnLEXsEUzA6gwSYc8PfvVP2fBDio3hcFrPQ8rCCM");
  let vaultSignerB = new PublicKey("81AEaxUFTabugYjHp1yzGWMTtaVkNh14rNeifzLMhsJp");
  let openOrdersB = new PublicKey("6bixSDV1AJbGpoGJvu2GDBQEaA219eo6vUPMS1xGSvDG");  
  let orderPayerTokenAccountB=  new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let coinWalletB =  new PublicKey("ExsJv1LA95SJtBCmbLmTyYpEUnYqcfZtqiwNX4a7i6bW"); 
  let pcWalletB = new PublicKey("CJYwmsdLcC8HQyzDSvuMjgsqLDyegDj2V3a7WvZANkT4");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
  
*/


  
/*
  // SHDWUSDC => GMTUSDC ( amount : 4 => success)
  // decimal : 9 => 6

  let marketA = new PublicKey("CVJVpXU9xksCt2uSduVDrrqVw6fLZCAtNusuqLKc5DhW");
  let requestQueueA =new PublicKey("58vaqyGXU3qhoEnhq74QxBLkibZ1WFcrDx13awEw4ZuH"); 
  let eventQueueA = new PublicKey("8aChPdbQ5puSnVV5TLGy38RJCRu7EkjkdmAGGnyfESgP"); 
  let bidsA = new PublicKey("ESw1WkUB1rdifrK5UQwGFD1YtHhrZ1NzahGjh6PJ95Ps");
  let asksA = new PublicKey("Hf4siFCMfhWnjSBtEHi7Y8edfLseGzdSuvJ9KKPEr8Tq"); 
  let coinVaultA = new PublicKey("F3cScQ9u1EGLVGJwuHWxT5RG2ivQFTxLvPqRwjnKxAU6")  ;
  let pcVaultA =new PublicKey("2baMnjbNw7cTarrJPnaWckxv28RyVMbZRUoL4aGUmVzA"); 
  let vaultSignerA = new PublicKey("GpthK93KvWgQddsBUpuhJcLRxNn5XpEUx9omSUTjtBjV");
  let openOrdersA = new PublicKey("HbnayeHvKRduzBr8sF5CRxHTDwimGn6X1VJsYa1pzh4d"); 
  let orderPayerTokenAccountA = new PublicKey("6giqn3FYZjoiNtQxeJPHoVNpqZSTA7FNTrm2dLBkKwhF"); 
  let coinWalletA =  new PublicKey("6giqn3FYZjoiNtQxeJPHoVNpqZSTA7FNTrm2dLBkKwhF"); 
  let pcWalletA = new PublicKey("8KUywQrm9EqeBtd2XUgv8Rs6E33DU3kwDesaKaXagMQU");
  let marketB = new PublicKey("B9HfUpFYPTiCdeGAb79BpJPsJi9mQUkDfSrQBqZh8MBT"); 
  let requestQueueB = new PublicKey("65L6WAMFXtx8o22ifRmuoSdtJP6jKHvJ5GS3FnnB4TXg"); 
  let eventQueueB = new PublicKey("5ez6LguttnWfh5yZ8wWhSKFbvScy7fDReQo6dxisoDzW"); 
  let bidsB = new PublicKey("DscAuvngnKtoQxNmA3LdRVDxmt98tuJyt1r2eXsqgMCh");
  let asksB = new PublicKey("BTG4BYpHtDqSYvx6UU6sngavnxYBushpG4fExeytzjbC"); 
  let coinVaultB = new PublicKey("14QK32hhgvSo8DT6CccL6RZ5dDaKPZfuHVNPHP5kN4Ud"); 
  let pcVaultB = new PublicKey("F5sZdnLEXsEUzA6gwSYc8PfvVP2fBDio3hcFrPQ8rCCM");
  let vaultSignerB = new PublicKey("81AEaxUFTabugYjHp1yzGWMTtaVkNh14rNeifzLMhsJp");
  let openOrdersB = new PublicKey("8AeskxKEFaa6X1dtgk57iEVGRLaq8xD1uMBzcMnXUvGj");  
  let orderPayerTokenAccountB=  new PublicKey("8KUywQrm9EqeBtd2XUgv8Rs6E33DU3kwDesaKaXagMQU");
  let coinWalletB =  new PublicKey("DCNZbwsJoSjKebEBX6v6aq683EF3Fo1uwJfNdCeB17FU"); 
  let pcWalletB = new PublicKey("8KUywQrm9EqeBtd2XUgv8Rs6E33DU3kwDesaKaXagMQU");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
// HXROUSDT => PORTUSDC (Success amount : 4 , decimal : 8,6)

let marketA = new PublicKey("CBb5zXwNRB73WVjs2m21P5prcEZa6SWmej74Vzxh8dRm");
  let requestQueueA =new PublicKey("37jVZnTHiDDyWb74v53z33ZZHDyVGeQbhyisioAww7hy"); 
  let eventQueueA = new PublicKey("DKEBL8Y4wg7i6eKgsFaEJrbyFX1LdDVJH47TqKwTrruk"); 
  let bidsA = new PublicKey("CvD9bMPTv5Tw4RDeyuyJTDGh5PLSHCwqnS2ohdMbKkHF");
  let asksA = new PublicKey("ALjG32gQtrzGVoczUcLB55KCkNhUjcNstbsZMHtBVEVH"); 
  let coinVaultA = new PublicKey("FDqzJeVTWiLWVHKhhY1ihiPeLbxKxdJhnZXQS5qkPGU6")  ;
  let pcVaultA =new PublicKey("FGbGS3GqLVkuWL1pTskyygHW9CpD6TwvzJ61fMKdqbpN"); 
  let vaultSignerA = new PublicKey("9Y6dqYywzBY4PGzcAuHCEmF9nRr4pMPzqUtKgC4RiwSo");
  let openOrdersA = new PublicKey("DaeVnXWFhNTBP8AAMLut4djPMKFe4Hy9dwg7bpJbqREZ"); 
  let orderPayerTokenAccountA = new PublicKey("8PKMSWeoLYmRgLFGEURuL2Khp18RhwbYGmmoaLZHFfz9"); 
  let coinWalletA =  new PublicKey("8PKMSWeoLYmRgLFGEURuL2Khp18RhwbYGmmoaLZHFfz9"); 
  let pcWalletA = new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let marketB = new PublicKey("8x8jf7ikJwgP9UthadtiGFgfFuyyyYPHL3obJAuxFWko"); 
  let requestQueueB = new PublicKey("3ZC5LMTDm3qWKhmPJ4HRMA3Bepwhcf7DuVVzDXdwVmnZ"); 
  let eventQueueB = new PublicKey("8ptDxtRLWXAKYQYRoRXpKmrJje31p8dsDsxeZHEksqtV"); 
  let bidsB = new PublicKey("9Y24T3co7Cc7cGbG2mFc9n3LQonAWgtayqfLz3p28JPa");
  let asksB = new PublicKey("8uQcJBapCnxy3tNEB8tfmssUvqYWvuCsSHYtdNFbFFjm"); 
  let coinVaultB = new PublicKey("8rNKJFsd9yuGx7xTTm9sb23JLJuWJ29zTSTznGFpUBZB"); 
  let pcVaultB = new PublicKey("5Vs1UWLxZHHRW6yRYEEK3vpzE5HbQ8BFm27PnAaDjqgb");
  let vaultSignerB = new PublicKey("63ZaXnSj7SxWLFEcjmK79fyGokJxhR3UEXomN7q7Po25");
  let openOrdersB = new PublicKey("DeuQRhDfX9ggAbTdo9W7oV4LLmSH7k8RPhA3NprCrU2X");  
  let orderPayerTokenAccountB=  new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let coinWalletB =  new PublicKey("2GGe8iCysTU9myg7otwAGmJgf3tYBPEB7pYw7LFt8QPo"); 
  let pcWalletB = new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/



/*
    //ATLASUSDC => PORTUSDC (Success amount : -4 => +0.45 , decimal : 8,6)
let marketA = new PublicKey("Di66GTLsV64JgCCYGVcY21RZ173BHkjJVgPyezNN7P1K");
  let requestQueueA =new PublicKey("FcAGCEpXTSarcyBhN4nor8aR7p2yR9YF99vcocs5rqtd"); 
  let eventQueueA = new PublicKey("EYU32k5waRUxF521k2KFSuhEj11HQvg4MbQ9tFXuixLi"); 
  let bidsA = new PublicKey("2UabAccF1AFPcNqv9D46JgyGnErnaYAJuCwyaT5dCkHc");
  let asksA = new PublicKey("9umNLTbks7S51TEB8XF4jeCxwyq3qmdHrFDMFB8cT1gv"); 
  let coinVaultA = new PublicKey("22a8dDQwHmmnW4M4WuSXHC9NdQAufZ2V8at3EtPzBqFj")  ;
  let pcVaultA =new PublicKey("5Wu76Qx7EoiR79zVVV49cZDYZ5csZaKFiHKYtCjF9FNU"); 
  let vaultSignerA = new PublicKey("FiyZW6n5VE64Yubn2PUFAxbmB2FZXhYce74LzJUhqSZg");
  let openOrdersA = new PublicKey("9hJxp7SwCc1iUTxodYK7Zb72q1RH1i8f5w9MT543mF4M"); 
  let orderPayerTokenAccountA = new PublicKey("GzJZRXmgWwvbsDwgaeWiPAjGMgzcpMwVtjsvXEbjQW7T"); 
  let coinWalletA =  new PublicKey("GzJZRXmgWwvbsDwgaeWiPAjGMgzcpMwVtjsvXEbjQW7T"); 
  let pcWalletA = new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let marketB = new PublicKey("8x8jf7ikJwgP9UthadtiGFgfFuyyyYPHL3obJAuxFWko"); 
  let requestQueueB = new PublicKey("3ZC5LMTDm3qWKhmPJ4HRMA3Bepwhcf7DuVVzDXdwVmnZ"); 
  let eventQueueB = new PublicKey("8ptDxtRLWXAKYQYRoRXpKmrJje31p8dsDsxeZHEksqtV"); 
  let bidsB = new PublicKey("9Y24T3co7Cc7cGbG2mFc9n3LQonAWgtayqfLz3p28JPa");
  let asksB = new PublicKey("8uQcJBapCnxy3tNEB8tfmssUvqYWvuCsSHYtdNFbFFjm"); 
  let coinVaultB = new PublicKey("8rNKJFsd9yuGx7xTTm9sb23JLJuWJ29zTSTznGFpUBZB"); 
  let pcVaultB = new PublicKey("5Vs1UWLxZHHRW6yRYEEK3vpzE5HbQ8BFm27PnAaDjqgb");
  let vaultSignerB = new PublicKey("63ZaXnSj7SxWLFEcjmK79fyGokJxhR3UEXomN7q7Po25");
  let openOrdersB = new PublicKey("DeuQRhDfX9ggAbTdo9W7oV4LLmSH7k8RPhA3NprCrU2X");  
  let orderPayerTokenAccountB=  new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let coinWalletB =  new PublicKey("2GGe8iCysTU9myg7otwAGmJgf3tYBPEB7pYw7LFt8QPo"); 
  let pcWalletB = new PublicKey("JBw31qDJLxcWsigNijRycX3bq3hZoSfwxsE6b7Lk2sV5");
  let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z");
  let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  let TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  let swapProgramId = new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD");
  let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
// GMTUSDC => NOVAUSDC (decimal : 9=> 9) err : 12e

let marketA = new PublicKey("B9HfUpFYPTiCdeGAb79BpJPsJi9mQUkDfSrQBqZh8MBT");
let requestQueueA =new PublicKey("65L6WAMFXtx8o22ifRmuoSdtJP6jKHvJ5GS3FnnB4TXg");
let eventQueueA =new PublicKey("5ez6LguttnWfh5yZ8wWhSKFbvScy7fDReQo6dxisoDzW");
let bidsA = new PublicKey("DscAuvngnKtoQxNmA3LdRVDxmt98tuJyt1r2eXsqgMCh"); 
let asksA = new PublicKey("BTG4BYpHtDqSYvx6UU6sngavnxYBushpG4fExeytzjbC"); 
let coinVaultA = new PublicKey("14QK32hhgvSo8DT6CccL6RZ5dDaKPZfuHVNPHP5kN4Ud");
let  pcVaultA = new PublicKey("F5sZdnLEXsEUzA6gwSYc8PfvVP2fBDio3hcFrPQ8rCCM"); 
let vaultSignerA = new PublicKey("81AEaxUFTabugYjHp1yzGWMTtaVkNh14rNeifzLMhsJp"); 
let openOrdersA =new PublicKey("5HDoseDGuHRG8uAty9AFbSCNhSHSXt9y76dNCXjCWp8f"); 
let orderPayerTokenAccountA = new PublicKey("84TwiHVXqkRVa9ZYw7NWWcqcSLdTdGZgCt8rgJ7E72bb"); 
let coinWalletA= new PublicKey("84TwiHVXqkRVa9ZYw7NWWcqcSLdTdGZgCt8rgJ7E72bb"); 
let pcWalletA = new PublicKey("G2JpifeyizKtU8fvF3izo3nAgie6amgxUJN9aKiC29z4");
let marketB = new PublicKey("2awwFbLKpdD6xkRQgL5iPeyqfwGcVZ6HLZsyEUbVmt4y");
let requestQueueB = new PublicKey("EVTHFYoJ23M5LqzrZPiLb9TtYKiS96vpA5rykEQKwR1P"); 
let eventQueueB = new PublicKey("PG2uT1p3bj7REDuuRJtiewj9hXw9B9ZS5wL4HrxGCx4"); 
let bidsB = new PublicKey("B5mQjV9LH7JbQDCUyVv45DnrhN6fx29as6BnzfycHtNY"); 
let asksB = new PublicKey("AXrbvLmZkm6BEyFpQHSF8KYsLYRkXyRCgYDHspuWNgHT"); 
let coinVaultB = new PublicKey("6vgeDbCJNwvsAnUPZPQg8LJQj3PAjfKjbN9QxZMPx8Qp"); 
let pcVaultB = new PublicKey("6S7ZwqyrnUecBhzoKKbJdaykKVAXLprbfk7aMxQMJ67j"); 
let vaultSignerB =new PublicKey("6Nuytrm9iwaW2DKP9GN2MrnXzAeZaz4EWEBTaK316g36"); 
let openOrdersB = new PublicKey("EGTgNhMWmQ1W6Ei9qQW8nVjsMnoTrauBfhUV1ZBVrBKD"); 
let orderPayerTokenAccountB =new PublicKey("G2JpifeyizKtU8fvF3izo3nAgie6amgxUJN9aKiC29z4"); 
let coinWalletB = new PublicKey("3y7xj74VbfLrRTfAbChJfqCGi8Xz3T7ykwLoPUHto2Xj"); 
let pcWalletB = new PublicKey("G2JpifeyizKtU8fvF3izo3nAgie6amgxUJN9aKiC29z4"); 
let authority =new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
// PRTWSOL => SBRWSOL (amount 300, decimal : 6 , 6 ) err :12
// PRTWSOL => SBRWSOL (amount 1000, decimal : 6 , 6 ) err :12

let marketA = new PublicKey("H7ZmXKqEx1T8CTM4EMyqR5zyz4e4vUpWTTbCmYmzxmeW"); 
let requestQueueA =new PublicKey("6YrKZWozNpNckzb7xA2rH5waLW9diwqff2pqjsG1Ltbu"); 
let eventQueueA =new PublicKey("2hYscTLaWWWELYNsHmYqK9XK8TnbGF2fn2cSqAvVrwrd"); 
let bidsA = new PublicKey("5Yfr8HHzV8FHWBiCDCh5U7bUNbnaUL4UKMGasaveAXQo"); 
let asksA = new PublicKey("A2gckowJzAv3P2fuYtMTQbEvVCpKZa6EbjwRsBzzeLQj"); 
let coinVaultA = new PublicKey("4Zm3aQqQHJFb7Q4oQotfxUFBcf9FVP6qvt2pkJA35Ymn"); 
let  pcVaultA = new PublicKey("B34rGhNUNxnSfxodkUoqYC3kGMdF4BjFHV2rQZAzQPMF"); 
let vaultSignerA = new PublicKey("9ZGDGCN9BHiqEy44JAd1ExaAiRoh9HWou8nw44MbhnNX"); 
let openOrdersA =new PublicKey("2qAKoGRDVe3oW5xQNQCxXxGZREXxdXrfKeErw36jYWZG"); 
let orderPayerTokenAccountA = new PublicKey("64g4WtPZ4uFeujE3ihiVvmDathdx94zwEQNTtwQXte3Y"); 
let coinWalletA = new PublicKey("64g4WtPZ4uFeujE3ihiVvmDathdx94zwEQNTtwQXte3Y"); 
let pcWalletA = new PublicKey("5cvpmjRwZvbkBmX3d2uvncDQ9Pf7bfHZ2XvutJCG8R9L");
let marketB = new PublicKey("5SVEELhhXzQcCv82tjqoXwmuaPUMkLEKwPQAX5FuDJGG"); 
let requestQueueB = new PublicKey("BKv3EWC6jYg1kJb3nx2tgt1kqpeKHcmv8DB8BvDkiZLz"); 
let eventQueueB = new PublicKey("2qeWSwJJ98qnGXCzswpocNkM2mjey1tZNduLmW9HVzxy"); 
let bidsB = new PublicKey("7rPmrUz1TCyfYjiiv6cXH2v5SKcKumDjm4UqWaieCiuf"); 
let asksB = new PublicKey("6gEiuEBdMKBS7Hf9R8DF67UPcTs24ryCcHbgKME9HjgE"); 
let coinVaultB = new PublicKey("5DBXTbkEaLGgRAk9ymW9tS9vt3YWrXbwVucz12fWvjtS"); 
let pcVaultB = new PublicKey("ArWJ6jD6nsDgmXAZ5hCPRPS3iHBtYfwzHsHAUydUxqZS"); 
let vaultSignerB =new PublicKey("CELPxXfXADWWkJzcfDEUzZVuvstC16S7SkUqUh2115rG"); 
let openOrdersB = new PublicKey("E4PvUKjS8zTs9kqkusg4Qs769mS7HV1wMKyQ8CWX9tgg"); 
let orderPayerTokenAccountB =new PublicKey("5cvpmjRwZvbkBmX3d2uvncDQ9Pf7bfHZ2XvutJCG8R9L"); 
let coinWalletB = new PublicKey("6ySWgZbGDSCU6DoWHxw64nHwyS44Mdz2pgenowZzv2JF");
 let pcWalletB = new PublicKey("5cvpmjRwZvbkBmX3d2uvncDQ9Pf7bfHZ2XvutJCG8R9L"); 
 let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
 let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
 let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
 let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
 let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
//PRTUSDC => SBRUSDC (amount : 300 , decimal : 6 , 6 ) : success 
// TX : 2zGz1VjxtJmrSYWGDfggiHi4zCP45BYeWGsPrAtoSYDgvFniCWGE5yKys6b5z3ar2agDZr9ozo6ncuYskvtHSfhK

let marketA = new PublicKey("CsNZMtypiGgxm6JrmYVJWnLnJNsERrmT3mQqujLsGZj");
 let requestQueueA =new PublicKey("2aiLJxCSgCA93J7kcQsWhjrGExd79zrwEBGFqUbd9yyX"); 
 let eventQueueA =new PublicKey("Cm7JvoHbM73pJNdEepuoGcMjd4ck5FhS9Zssgv1orNxh"); 
 let bidsA = new PublicKey("4bs4wRUtsuRdxYRkdwsG3rhe8gJd923wj74LeCt9oPbX"); 
 let asksA = new PublicKey("5FGde3u93n7QRuWMZr5Qp8Zq5waH75bQmC3wQCmyX1jV"); 
 let coinVaultA = new PublicKey("ABgSggPV2D3zbj1NaT3GjKnHdCkdRnVNPB5gzGF44F77"); 
 let  pcVaultA = new PublicKey("JxSE5jL1SuGu9zmkq3QmhF93phkRvvv5QbLZpQS97YK"); 
 let vaultSignerA = new PublicKey("EhxnzWjqFnDCr7XxC2CCXDGfb5cVz2hGfQNg6nEGgYQJ"); 
 let openOrdersA =new PublicKey("AtjcpiUWNokNg5gMAxyHtLWakYaFGqbBUR4GLP2wcJVo"); 
 let orderPayerTokenAccountA = new PublicKey("42TrGwesYSc3w9XgWqqR3PLrdJad6MarqUC7BZtYKsko"); 
 let coinWalletA = new PublicKey("42TrGwesYSc3w9XgWqqR3PLrdJad6MarqUC7BZtYKsko"); 
 let pcWalletA = new PublicKey("96EdqzkKC4CytgjpsC6rhncmUTx1icq7hryMe6NWF4JS");
let marketB = new PublicKey("HXBi8YBwbh4TXF6PjVw81m8Z3Cc4WBofvauj5SBFdgUs"); 
let requestQueueB = new PublicKey("iwa5jrLEdmzTxvR7iNUL4jrNK9g8aGeCPj1sdLHwwmP"); 
let eventQueueB = new PublicKey("EUre4VPaLh7B95qG3JPS3atquJ5hjbwtX7XFcTtVNkc7"); 
let bidsB = new PublicKey("FdGKYpHxpQEkRitZw6KZ8b21Q2mYiATHXZgJjFDhnRWM"); 
let asksB = new PublicKey("cxqTRyeoGeh6TBEgo3NAieHaMkdmfZiCjSEfkNAe1Y3"); 
let coinVaultB = new PublicKey("38r5pRYVzdScrJNZowNyrpjVbtRKQ5JMcQxn7PgKE45L"); 
let pcVaultB = new PublicKey("4YqAGXQEQTQbn4uKX981yCiSjUuYPV8aCajc9qQh3QPy"); 
let vaultSignerB =new PublicKey("84aqZGKMzbr8ddA267ML7JUTAjieVJe8oR1yGUaKwP53"); 
let openOrdersB = new PublicKey("BHLvkN3TvYDCqDgbcKyj9wAzUdgcNPMBZy6bXibBPnh9"); 
let orderPayerTokenAccountB =new PublicKey("96EdqzkKC4CytgjpsC6rhncmUTx1icq7hryMe6NWF4JS"); 
let coinWalletB = new PublicKey("AyahxPb98R3vu7saxGByjLv6RFAmkUi75opYdXLBdjVv"); 
let pcWalletB = new PublicKey("96EdqzkKC4CytgjpsC6rhncmUTx1icq7hryMe6NWF4JS"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//  MNDEmSOL => WBTCmSOL (amount : 55 , decimal : 9,6) success
// TX : https://explorer.solana.com/tx/3GMY7NubS7A84pwVhjhZR9AvbF8F7hvoDJoZaTkmnLugyTamJRiHfc6fpQvp7Xm89iHxmmPTFZRKFwFtXA6UoA7m


let marketA = new PublicKey("AVxdeGgihchiKrhWne5xyUJj7bV2ohACkQFXMAtpMetx"); 
let requestQueueA =new PublicKey("9F3AgSuYykP2u27RZDa9CgdVX2qvWy13y5MxWUR7hxxx"); 
let eventQueueA =new PublicKey("3eeXmsg8byQEC6Q18NE7MSgSbnAJkxz8KNPbW2zfKyfY"); 
let bidsA = new PublicKey("9YBjtad6ZxR7hxNXyTjRRPnPgS7geiBMHbBp4BqHsgV2"); 
let asksA = new PublicKey("8UZpvreCr8bprUwstHMPb1pe5jQY82N9fJ1XLa3oKMXg"); 
let coinVaultA = new PublicKey("aj1igzDQNRg18h9yFGvNqMPBfCGGWLDvKDp2NdYh92C"); 
let  pcVaultA = new PublicKey("3QjiyDAny7ZrwPohN8TecXL4jBwGWoSUe7hzTiX35Pza"); 
let vaultSignerA = new PublicKey("6Ysd8CE6KwC7KQYpPD9Ax8B77z3bWRnHt1SVrBM8AYC9"); 
let openOrdersA =new PublicKey("GQE5uVRwaUjQVtZY8DWEDaJptKkPKY3XKyo8giuNPCvR"); 
let orderPayerTokenAccountA = new PublicKey("FnokvwR9ygH9d1goMbW1CNZqhTtwPC5dgtRw1p5Z7ZaD"); 
let coinWalletA = new PublicKey("FnokvwR9ygH9d1goMbW1CNZqhTtwPC5dgtRw1p5Z7ZaD"); 
let pcWalletA = new PublicKey("9SPAPjNXrW1H6kVXcYrnGAk6AQL4BFZ47U3DNfswDqTH");
let marketB = new PublicKey("HvanEnuruBXBPJymSLr9EmsFUnZcbY97B7RBwZAmfcax"); 
let requestQueueB = new PublicKey("4tr2JgkKt4XqSb9r6pnLojoMZ4vVwJrsTBVAF9a83DnT"); 
let eventQueueB = new PublicKey("D4bcCmeFca5rF8KC1JDJkJTiRLLBmoQAdNS2x7zTaqF4"); 
let bidsB = new PublicKey("UPgp2Apw1weBoAVyozcc4WuAJrCJPf6ckSZa9psCe63"); 
let asksB = new PublicKey("HQyMusq5noGcSz2VoPqvztZyEAy8K1Mx6F37bN5ppH35"); 
let coinVaultB = new PublicKey("DxXBH5NCTENPh6zsfMstyHhoBtdaVnYSzHgaa6GyVbfY"); 
let pcVaultB = new PublicKey("9XqpiagW7bnAbMwpc85M2hfrcqxtvfgZucyrYPAPkcvq"); 
let vaultSignerB =new PublicKey("mZrDXx1TQizPd9CzToBx8FqqrPCPdePHy6ttgBdNPuB"); 
let openOrdersB = new PublicKey("6wKHrqTzJz5Vh8XN86VErn3fJ6zv5J67nBLou6zzzRvN"); 
let orderPayerTokenAccountB =new PublicKey("9SPAPjNXrW1H6kVXcYrnGAk6AQL4BFZ47U3DNfswDqTH"); 
let coinWalletB = new PublicKey("5DQnCKXfVQLycWbpHNzQbdv8znuZvwVRbh9MigU488FW"); 
let pcWalletB = new PublicKey("9SPAPjNXrW1H6kVXcYrnGAk6AQL4BFZ47U3DNfswDqTH"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
// ALEPHUSDT => FTTUSDT (amount : 211 , decimal : 8 , 8) success => +0.97
// TX : https://explorer.solana.com/tx/ZyXhkM27LejTZSYX56NrZY4dwtLPyySG2sAS2U7xMMdKQSzhSzRXZenZkyYgDnovLSMa63ZWEEZouhdkRnhaWRx

let marketA = new PublicKey("GZeHR8uCTVoHVDZFRVXTgm386DK1EKehy9yMS3BFChcL"); 
let requestQueueA =new PublicKey("DREZyfhRfkRoucTHxCos6RQSdxLwvpzj9fVHFPjSW6nx"); 
let eventQueueA =new PublicKey("Dwd7YpVkDJseK8BJgGes7PP1RAcLiWbm8q3U7Yfs9ww"); 
let bidsA = new PublicKey("AYzCXr1gR9UfcofYrG57igmPzudbEw51TJBJqpo3fyg2"); 
let asksA = new PublicKey("ADVrchFr4S6uCQUapcYFSr9PEP4LuMwaXraD9nZVVXxz"); 
let coinVaultA = new PublicKey("EquXWHttUW3bKwD3fFgjnbZxPUz5AgCToHJFMpxauvdn"); 
let  pcVaultA = new PublicKey("62NXoEKmAa7gYnGoHVKATLHUR4hSUCxBTykMzeW8k9qj"); 
let vaultSignerA = new PublicKey("7JzNioxQoLRyYci98yn3ghueoyVR5ssUJpCPG6aVvWz4"); 
let openOrdersA =new PublicKey("CAy8YFAcQNSuasTuLTbu7nGqzh6rEuvgoLmoYjeoFksX"); 
let orderPayerTokenAccountA = new PublicKey("Dn6VeXmgGHkFJbn5u3KQPmtnPgpn4cw1KnYs5PpMkSY");
 let coinWalletA = new PublicKey("Dn6VeXmgGHkFJbn5u3KQPmtnPgpn4cw1KnYs5PpMkSY"); 
 let pcWalletA = new PublicKey("7agA1WFe3UdiGBfRUgXK8SLfKmWWCLL3K2uduUnRvLtF");
let marketB = new PublicKey("BoHojHESAv4McZx9gXd1bWTZMq25JYyGz4qL1m5C3nvk"); 
let requestQueueB = new PublicKey("7Mmy9KzD8SXsemP7no2pZrKqbueR2HiQFktA7rj7nqZj"); 
let eventQueueB = new PublicKey("8uv9NyAaVhwxDB7VcXzQ3oEJDFA5pLSKrJo77Lt8HJTs"); 
let bidsB = new PublicKey("76YHX3oLbG2BsgdU8zQiPdWsYVMJptVyztaAZGWYfbzd"); 
let asksB = new PublicKey("FGKNQfwNxokJ1xdV3r4UnthjYZqcwrtMu7PJChrzQm9U"); 
let coinVaultB = new PublicKey("6fiZLieJd1XFEhooFD3YhyGtKpYJKA4nPftqEaNYsucq"); 
let pcVaultB = new PublicKey("LpCHpWuMdG5KcxEwsP11pdb2jDMPjubTNhSRsG2gTRc"); 
let vaultSignerB =new PublicKey("C16FrP39q5C6Ei4TxpRxq18tmhmSoH7Z63tBXKV27bsv"); 
let openOrdersB = new PublicKey("49h5TEAizNzanm8a7p5hX84pXnNcrWkmquDQVfxaZdg4"); 
let orderPayerTokenAccountB =new PublicKey("7agA1WFe3UdiGBfRUgXK8SLfKmWWCLL3K2uduUnRvLtF"); 
let coinWalletB = new PublicKey("Bs6NVP7T2Ed4wQRQfLXMBP2nBEE9uacEJcjnnN6cKEe9"); 
let pcWalletB = new PublicKey("7agA1WFe3UdiGBfRUgXK8SLfKmWWCLL3K2uduUnRvLtF"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
// PRTUSDC => FRONTUSDC ( amount:1000 , decimal : 6,8) => +0,1 success
// TX : https://explorer.solana.com/tx/3BCsAY2bAy92z233KEmYVDcVViavMZHPuscERjRXDfCJWchUDZKhCotf2wrkFvfsVZTYbv1eM5Yx7zJGUvzNehNj


let marketA = new PublicKey("CsNZMtypiGgxm6JrmYVJWnLnJNsERrmT3mQqujLsGZj"); 
let requestQueueA =new PublicKey("2aiLJxCSgCA93J7kcQsWhjrGExd79zrwEBGFqUbd9yyX"); 
let eventQueueA =new PublicKey("Cm7JvoHbM73pJNdEepuoGcMjd4ck5FhS9Zssgv1orNxh"); 
let bidsA = new PublicKey("4bs4wRUtsuRdxYRkdwsG3rhe8gJd923wj74LeCt9oPbX"); 
let asksA = new PublicKey("5FGde3u93n7QRuWMZr5Qp8Zq5waH75bQmC3wQCmyX1jV"); 
let coinVaultA = new PublicKey("ABgSggPV2D3zbj1NaT3GjKnHdCkdRnVNPB5gzGF44F77"); 
let  pcVaultA = new PublicKey("JxSE5jL1SuGu9zmkq3QmhF93phkRvvv5QbLZpQS97YK"); 
let vaultSignerA = new PublicKey("EhxnzWjqFnDCr7XxC2CCXDGfb5cVz2hGfQNg6nEGgYQJ"); 
let openOrdersA =new PublicKey("F1CY7tSq6Mm95g4xgNLgZyXN9Wbvisr8wZwYTF6Yq6DS"); 
let orderPayerTokenAccountA = new PublicKey("8KYGCYQJc9nPPNTVPAqqJJVy2PnP8PTrUYcTRoEq8K5d"); 
let coinWalletA = new PublicKey("8KYGCYQJc9nPPNTVPAqqJJVy2PnP8PTrUYcTRoEq8K5d"); 
let pcWalletA = new PublicKey("Hw6PWWgTjS3Qzr9pktqxYKh995LX2dGBYjDUxT3cSryf");
let marketB = new PublicKey("B95oZN5HCLGmFAhbzReWBA9cuSGPFQAXeuhm2FfpdrML"); 
let requestQueueB = new PublicKey("FZ5sv1X1CB1p4hANAmE8sDD7t97o4YEs9WYw2oetEVqp"); 
let eventQueueB = new PublicKey("GCD3iQM4HT7bP4He7Pzc4siquNCwFvdYWZ7P8nxfQLSR"); 
let bidsB = new PublicKey("7pmaXwAPUb8GjU7rhXBnKAAEkXxhBKGc6FzuLUiHpZTX"); 
let asksB = new PublicKey("2rQt4BtgkJVFy3Pd2GtTNjW3nmUHiJwG38SufxpuLuL2"); 
let coinVaultB = new PublicKey("3gociVwayUfJFSGuCkdBgZmhwu8tpn8K5LjjJYLjHXM3"); 
let pcVaultB = new PublicKey("HGmkR3mKZ3YdPJY7Ygo6nCkE53fHgHdVFmtFdDr5aWbh"); 
let vaultSignerB =new PublicKey("H99sB7fxbLjbABoYJhmGyqNDmiGsY6DWwmwtMQMBb6aC"); 
let openOrdersB = new PublicKey("F4eTZmFaj5rYtvENmFChN2uuEQYyp6f7KxtGt1WYUCZa"); 
let orderPayerTokenAccountB =new PublicKey("Hw6PWWgTjS3Qzr9pktqxYKh995LX2dGBYjDUxT3cSryf"); 
let coinWalletB = new PublicKey("Eh2FwgmGjNHdNJ9KFtAWae1wEGD3xjciiFwdc2DHGQFJ"); 
let pcWalletB = new PublicKey("Hw6PWWgTjS3Qzr9pktqxYKh995LX2dGBYjDUxT3cSryf"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
// RATIOUSDC => SBRUSDC ( amount : 1 , decimal : 6,6) +148.39
// TX : https://explorer.solana.com/tx/3kCefVPFSxfheZ2GHHoP46g4NyCbAACCoTAu7LNCTq6h141jYk3FFXWSH8KtJgj85R5qVorEgYPEHYSQbBjdqFes


let marketA = new PublicKey("HtcFhAWSJnuvbJvGLoRFr36zC5y1M1RPtBCgGQfdLFw5"); 
let requestQueueA =new PublicKey("Kxp3fQJTnWwsVjiZva5USMVFQGMj5M84Y9XMqG3ggGi"); 
let eventQueueA =new PublicKey("23prbATCEWqJ1gBA73d9KmyFwvEpS8JwigQ75QT8UFSE"); 
let bidsA = new PublicKey("HX4dWb2Yjdv2uFJGEpmRNXqNnMyZGoGn9gxKeaDD54U5"); 
let asksA = new PublicKey("C17r832RU8PStad2R7z6ciFoDY5BeychVXEd4UWrBrKM"); 
let coinVaultA = new PublicKey("AmbbYtJgFoUg4DBqZH4zh8PEHAV9hdJLuvt8GVkU4W6U"); 
let  pcVaultA = new PublicKey("2VC7xpu7tNziBpU8aJ6ZJNzgQk7Pmwi3sbQDffnvKjcX"); 
let vaultSignerA = new PublicKey("HzekXknVoo8JxWxjXfJs4ToSaqt6UmDx4UxtJwXwPHgr"); 
let openOrdersA =new PublicKey("Gvk5SGyWinwwjPogVaLouNBDTFCS4ALBZUsxt25ki24d"); 
let orderPayerTokenAccountA = new PublicKey("H7SfDJB7Wg62cAV2xk9g2cM5Qj1eFDGwiYXomZhe1HNZ"); 
let coinWalletA = new PublicKey("H7SfDJB7Wg62cAV2xk9g2cM5Qj1eFDGwiYXomZhe1HNZ"); 
let pcWalletA = new PublicKey("9kFHfMQnpqfaJqWbUAa5LaGjM6a6PzWebp5KTiD5Wxfj");
let marketB = new PublicKey("HXBi8YBwbh4TXF6PjVw81m8Z3Cc4WBofvauj5SBFdgUs"); 
let requestQueueB = new PublicKey("iwa5jrLEdmzTxvR7iNUL4jrNK9g8aGeCPj1sdLHwwmP"); 
let eventQueueB = new PublicKey("EUre4VPaLh7B95qG3JPS3atquJ5hjbwtX7XFcTtVNkc7"); 
let bidsB = new PublicKey("FdGKYpHxpQEkRitZw6KZ8b21Q2mYiATHXZgJjFDhnRWM"); 
let asksB = new PublicKey("cxqTRyeoGeh6TBEgo3NAieHaMkdmfZiCjSEfkNAe1Y3"); 
let coinVaultB = new PublicKey("38r5pRYVzdScrJNZowNyrpjVbtRKQ5JMcQxn7PgKE45L"); 
let pcVaultB = new PublicKey("4YqAGXQEQTQbn4uKX981yCiSjUuYPV8aCajc9qQh3QPy"); 
let vaultSignerB =new PublicKey("84aqZGKMzbr8ddA267ML7JUTAjieVJe8oR1yGUaKwP53"); 
let openOrdersB = new PublicKey("6m1FPx8W1QypR1KBv2R31iAbLGD9DPRjdK94EQEZjizz"); 
let orderPayerTokenAccountB =new PublicKey("9kFHfMQnpqfaJqWbUAa5LaGjM6a6PzWebp5KTiD5Wxfj"); 
let coinWalletB = new PublicKey("ER98Qd1ZKtFyXi7FNWPHfZn2EugYZeyLT7KrkzZ7Ux7p"); 
let pcWalletB = new PublicKey("9kFHfMQnpqfaJqWbUAa5LaGjM6a6PzWebp5KTiD5Wxfj"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


// HBBUSDH => stSOLUSDH : (AMOUNT : 371 , DECIMAL :6 ,9) Err:12e


let marketA = new PublicKey("Hv5PaMRtoLoaQWof8ULw9KfaqDEFgh3N8nMjAybiNXEE"); 
let requestQueueA =new PublicKey("HDpSmxbtePTGpuP1qMzekYpov3tcJ2AP76sJgmf8ee5B"); 
let eventQueueA =new PublicKey("Cw4bDyXbr5g2AYTxZundNEfzALVgVA2DYYasHyKn9ZbU"); 
let bidsA = new PublicKey("ELah2pPbwozitVejx5KRYMtFz1bEhTWvvdye7sbaS6Xg"); 
let asksA = new PublicKey("GDaAqnu6SwoahipnNXcduChSYApK8Pc9B6jrqc6ggN4M"); 
let coinVaultA = new PublicKey("2N3qE4dhQe1d2yCZdsriM2yTEmqjohRabdvq49uqDfRc"); 
let  pcVaultA = new PublicKey("GiLxnkwc9xtzmHASoXq4YrEZuiQjD8xeR9K4AwFU8wZH"); 
let vaultSignerA = new PublicKey("87d9q1BRvzUkamSzYNBE8SQ6fHCpEE4NWbfkTpG4Yqf"); 
let openOrdersA =new PublicKey("HZ1dj1RGjUrVSHvwJnuj9R8gqvPs3vMURuzJmD8D5LBT"); 
let orderPayerTokenAccountA = new PublicKey("4ptLdoXyxkaEJtP81wq3TdKdjJaWjQVZHEmK29os4FzZ"); 
let coinWalletA = new PublicKey("4ptLdoXyxkaEJtP81wq3TdKdjJaWjQVZHEmK29os4FzZ"); 
let pcWalletA = new PublicKey("5qi3A8dN1izxz7u81HpXNbd7GurRok9jPS7bKfooMiRp");

let marketB = new PublicKey("Ew4txCzxaWzDAaWMSPNEdjfM9sBbsH4mj1Ji3XGQyHsr"); 
let requestQueueB = new PublicKey("5tacvFuMtwVUJmFdy6weQbjybhaz6ik7MZDhY6pmAcF1"); 
let eventQueueB = new PublicKey("FbpR2TMa3FmXsQLbL43e6PuiKRQyewBwecMKZ2F1eDax"); 
let bidsB = new PublicKey("AFvkxyZSXnaWMW1zVKkCrN6TAVCxTqbRV31hmQQFyFmA"); 
let asksB = new PublicKey("Bi623hRo5R9fVWBFcGFtBQ5CtK1E8gUDJAdtVBJyHvV1"); 
let coinVaultB = new PublicKey("F6L2KXEGNvagM1AgFJiA1BQ8NYjH8CmQ6zWsrKj7fjuJ"); 
let pcVaultB = new PublicKey("GT8NHdbizUw9S9ghxjhEoaeyimW3ZR5V4CLtv55uqnWk"); 
let vaultSignerB =new PublicKey("6k5rqdUe3LsdjFB6sTjynUYXyucm5PRUfeN6AfbXxF7b"); 
let openOrdersB = new PublicKey("8adkcrwHvuBuMYM4szpZhe9ysvVetb5sLvQ55zTg3TP6"); 
let orderPayerTokenAccountB =new PublicKey("5qi3A8dN1izxz7u81HpXNbd7GurRok9jPS7bKfooMiRp"); 
let coinWalletB = new PublicKey("7P4Zeyfu6FQzW4WBADmgD1NETfyvei9HjXkarpF2xCGi"); 
let pcWalletB = new PublicKey("5qi3A8dN1izxz7u81HpXNbd7GurRok9jPS7bKfooMiRp"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");



/*
//SLNDUSDC => RAYUSDC = (amount:2.7 , decimal : 6,6) => SUCESS => 3.2
//TX: https://explorer.solana.com/tx/4QA7nfEqmhpv1YrEQfRjLPYWXucTSUNAPfx4zWpRexCThxPMEypP3ojDGHWcGcCp3SXB7ejSjxiQoWFgNm3u7oaa

let marketA = new PublicKey("F9y9NM83kBMzBmMvNT18mkcFuNAPhNRhx7pnz9EDWwfv"); 
let requestQueueA =new PublicKey("FRNcKZRtrMzjranhAqi57weWFLoQBZbDTcy6VvupMEhL"); 
let eventQueueA =new PublicKey("8so7uCu3u53PUWU8UZSTJG1b9agvQtQms9gDDsynuXr1"); 
let bidsA = new PublicKey("EcwoMdYezDRLVNFzSzf7jKEuUe32KHp5ddU7RZWdAnWh"); 
let asksA = new PublicKey("4iLAK21RWx2XRyXzHhhuoj7hhjVFcrUiMqMSRGandobn"); 
let coinVaultA = new PublicKey("5JDR5i3wqrLxoZfaytoW14hti9pxVEouRy5pUtyhisYD"); 
let  pcVaultA = new PublicKey("6ktrwB3FevRNdNHXW7n6ufk2h1jwKnWFtjhHgNwYaxJb"); 
let vaultSignerA = new PublicKey("HP7nqJpWXBS91fRncBCawqidJhxqNwKbS84Ni3HBTiGG"); 
let openOrdersA =new PublicKey("7u1DHUZiABWKqAYXKtWYFoVDEtNePbCEPVEBr6miPQN8"); 
let orderPayerTokenAccountA = new PublicKey("ESwnfC8udXtr3DZgyHv1bRZFJHjSM1tzx6EmmuScTXH7"); 
let coinWalletA = new PublicKey("ESwnfC8udXtr3DZgyHv1bRZFJHjSM1tzx6EmmuScTXH7"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");
let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*

//ORCAUSDC =>  RAYUSDC (amount : 2, DECIMAL :6 ,6) => success : 2,7
// TX: https://explorer.solana.com/tx/3CV8Yvpu1Kq4nPZoqkJ9FGxAx8Jugp7fbZEeottMfuc4DKzxN4WXdDnYSryfvmoE5FKEadAAJhM6cZvRQmY96SiJ


let marketA = new PublicKey("8N1KkhaCYDpj3awD58d85n973EwkpeYnRp84y1kdZpMX"); 
let requestQueueA =new PublicKey("8c8b8BhwDXoxtsnK2KbxvDpRxCymMUYi6VJ69CDP2Hd5"); 
let eventQueueA =new PublicKey("3ajZQLGpAiTnX9quZyoRw1T4E5emWbTAjFtdVyfevXds"); 
let bidsA = new PublicKey("HaAjqsdR6CzDJAioL6s9RGYL7tNC84Hv65S1Gm6MeS9s"); 
let asksA = new PublicKey("BQUychhbQfWHsAdTtrcy3DxPRm3dbqZTfYy1W7PQS9e"); 
let coinVaultA = new PublicKey("4noUQEJF15yMVWHc7JkWid5EKoE6XLjQEHfdN3pT43NZ"); 
let pcVaultA = new PublicKey("38DxyYjp4ZqAqjrvAPvDhdALYd4y91jxcpnj28hbvyky"); 
let vaultSignerA = new PublicKey("Dtz4cysczNNTUbHMqnZW2UfUm87bGecR98snGZePt2ot"); 
let openOrdersA =new PublicKey("Cz41HG9xskKKQ812W6DfdmtEe6ADn62SrfXKiYYs1SCg"); 
let orderPayerTokenAccountA = new PublicKey("BHCMNiKaBRvTwEgFqbBwLDyGywFEaawqHbLH7intLVy4"); 
let coinWalletA = new PublicKey("BHCMNiKaBRvTwEgFqbBwLDyGywFEaawqHbLH7intLVy4"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//FIDAUSDC =>  RAYUSDC (amount :2.4 , DECIMAL :6 ,6) => success : 1.6
//	TX : https://explorer.solana.com/tx/3DNgaQcf3HFjUPFbeWVb6yvTNFayTwFh75UR7NR1KPzmTGHm3uwu4kdRjxt2WstvtsWKKs7VAUS7Mdy4hutbZjmc


let marketA = new PublicKey("E14BKBhDWD4EuTkWj1ooZezesGxMW8LPCps4W5PuzZJo"); 
let requestQueueA =new PublicKey("5sKfeSkRmVcpnUydFPXGAEZgg2Dqs28mhBYQr5aBv3g4"); 
let eventQueueA =new PublicKey("AfqDqAQaivYTVY5HZdbmvJiGKFHsv4NmdQUfjwyaZ3Fw"); 
let bidsA = new PublicKey("32XHCtmXR564sWGMfqiSuSALjZtoCLCtvmdiMfJctEtL"); 
let asksA = new PublicKey("GwUfumrvowPJtQGFQuXYrRPDZCFFPwzuu7V72tjCyi12"); 
let coinVaultA = new PublicKey("9orp82njuopbWUzrGH417wvp2mED5h5hJdNGbKLaYxzJ"); 
let  pcVaultA = new PublicKey("7YpRpKkjwpTxT42pda4TjPjm2JzMq7ZtfAAB3aQypBQ7"); 
let vaultSignerA = new PublicKey("6QCNAdJywPxW1db9JgS8PpRUxKcTgk6PHXM7pEzGkBG9"); 
let openOrdersA =new PublicKey("3LBBpueXCqBjhfb3tvCdAmJg9paBr6A6NY5i6NTa3rmV"); 
let orderPayerTokenAccountA = new PublicKey("zUeSUGJYwGo4HJ3atM5PdWwXsHk9ZX5yPWpbQHLbzCk"); 
let coinWalletA = new PublicKey("zUeSUGJYwGo4HJ3atM5PdWwXsHk9ZX5yPWpbQHLbzCk"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//MNGOUSDC =>  RAYUSDC (amount :2.3 , DECIMAL :6 ,6) => success : 0.1
//TX: https://explorer.solana.com/tx/3heSpXC7EHHFRBPJF2sxhBRrNa1c6r9piZ9zGrqgmmcCU6zgWagLmvxinvpMoVEEW7Jhwqdpvh1QgjoYWB79Vysx

let marketA = new PublicKey("3d4rzwpy9iGdCZvgxcu7B1YocYffVLsQXPXkBZKt2zLc"); 
let requestQueueA =new PublicKey("EgafUKwVAmEj2czrt7HkWnZJLZSAK9BDN5aGQpLypAys"); 
let eventQueueA =new PublicKey("H1VVmwbM96BiBJq46zubSBm6VBhfM2FUhLVUqKGh1ee9"); 
let bidsA = new PublicKey("3nAdH9wTEhPoW4e2s8K2cXfn4jZH8FBCkUqtzWpsZaGb"); 
let asksA = new PublicKey("HxbWm3iabHEFeHG9LVGYycTwn7aJVYYHbpQyhZhAYnfn"); 
let coinVaultA = new PublicKey("7Ex7id4G37HynuiCAv5hTYM4BnPB9y4NU85QcaNWZy3G"); 
let  pcVaultA = new PublicKey("9UB1NhGeDuV1apHdtK5LeAEjP7kZFH8vVYGdh2yGFRi8"); 
let vaultSignerA = new PublicKey("BFkxdUwW17eANhfs1xNmBqEcegb4EStQxVb5VaMS2dq6"); 
let openOrdersA =new PublicKey("CegY5MXC5QBrtaMGNg42PT2Tkf1dUx3G6mvDTFWitLpT"); 
let orderPayerTokenAccountA = new PublicKey("A7JAH5r1SrdQWfHEot5hAC8axmwfzJfDekfTECGzxUcd"); 
let coinWalletA = new PublicKey("A7JAH5r1SrdQWfHEot5hAC8axmwfzJfDekfTECGzxUcd"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/



/*
//AVAXUSDC => RAYUSDC (amount:0.11 , DECIMAL : 8,6 ) => => success : 3,3
//TX : https://explorer.solana.com/tx/2PWMht9Mh7rpDrsZ7KfNALduDzZxmk4jRmJoWN57z1WUtozRtDEQTbxkSoTkpqDUzskyWyVuZJVLtERYPR9c8983


let marketA = new PublicKey("E8JQstcwjuqN5kdMyUJLNuaectymnhffkvfg1j286UCr"); 
let requestQueueA =new PublicKey("HvxcJ8Nbd6HcoN1ud7eA4JXvASxLERSob1HSNM5frYhW"); 
let eventQueueA =new PublicKey("HY7ZpmQ6VXLHKxN4cruFKMTNu42EbjPEDthyGPnsYYHq"); 
let bidsA = new PublicKey("925NuYb44V63wNRooM5tBFNCXM5daD72m6KDxoCmYpYX"); 
let asksA = new PublicKey("q2eUYuqJeBD6DndxDQ2tEuFqAe6j9j9jMtMnkkKU5P9"); 
let coinVaultA = new PublicKey("GCy2YwPXnK8XSaTzekBXqk7QM39obxA4uASsC316KpZ5"); 
let  pcVaultA = new PublicKey("8PDzWsq8J4AWBk1YSnS5NHSpZWhXxaM5dvGQLxgWxAX6"); 
let vaultSignerA = new PublicKey("CUG8UvhW1q6ojQC2gyga8x67nde37vvsJUUbinTaPU9N"); 
let openOrdersA =new PublicKey("t7oWdGdgGGv8AFB1tHKSh9z7humU4wo9hjveKMs6Npx"); 
let orderPayerTokenAccountA = new PublicKey("AnRsHAT6V5QfpGPdNnuPHcqZNd2Ku6RqewbU4wiBpcQT"); 
let coinWalletA = new PublicKey("AnRsHAT6V5QfpGPdNnuPHcqZNd2Ku6RqewbU4wiBpcQT"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//JSOLUSDC => RAYUSDC (amount :0.1 , decimal : 9,6) => success : +2.8
//TX : https://explorer.solana.com/tx/3SFMSLNE9qmPJqz1R7PALX9qGo9s3UNzE57cgx5b4afkvioduzkN8YawjvgqTCVu5pMX5gNyG2jLyxdW2ttec8zu

let marketA = new PublicKey("8mQ3nNCdcwSHkYwsRygTbBFLeGPsJ4zB2zpEwXmwegBh"); 
let requestQueueA =new PublicKey("7Qj25p2hWMViBfkF5PHNxCDH3UkA8E2Nas1YJLKNBpdA"); 
let eventQueueA =new PublicKey("2zvmX9TGi5afJs2B6EPaPCBbHLkydAh5TGeCsGkwv9nB"); 
let bidsA = new PublicKey("9gwbJpCGVRYKM6twn5tyqkxXEo49JMKp4usZJQjPxRg1"); 
let asksA = new PublicKey("CsaJr18TyYhcabQjn16HW3ZsSoUbct8NSLSKuUcbr1cW"); 
let coinVaultA = new PublicKey("9uZNMq6TbFQWT7Mj3fkH7gy9gP5bdroJKPpDFyA8x2NW"); 
let  pcVaultA = new PublicKey("9W3sz9P8LiAKDbiaY83cKssmuQckgFpzyKKXKYMrivkB"); 
let vaultSignerA = new PublicKey("2J63m8YjYMr495tU6JfYT23RfEWwaQfzgQXxzctXCgXY"); 
let openOrdersA =new PublicKey("5J84y3gQfjBGUneyQ626qF9JvqCXGLvCpfAgyCkmpsLa"); 
let orderPayerTokenAccountA = new PublicKey("GjcDLHzzFZyiA9BSPBi5b5nSnKK2zUfHq4EcGbewcKQm"); 
let coinWalletA = new PublicKey("GjcDLHzzFZyiA9BSPBi5b5nSnKK2zUfHq4EcGbewcKQm"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
//soETHUSDC => RAYUSDC (AMOUNT , DECIMAL :8,6 )=> 
// error in mint asset soETH 
//XXX to be fixed 

let marketA = new PublicKey("4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX"); 
let requestQueueA =new PublicKey( "6yJsfduT4Av6xaECAoXf4cXHaQQYjf78D1FG3WDyuxdr"); 
let eventQueueA =new PublicKey("Eac7hqpaZxiBtG4MdyKpsgzcoVN6eMe9tAbsdZRYH4us"); 
let bidsA = new PublicKey("8tFaNpFPWJ8i7inhKSfAcSestudiFqJ2wHyvtTfsBZZU"); 
let asksA = new PublicKey("2po4TC8qiTgPsqcnbf6uMZRMVnPBzVwqqYfHP15QqREU"); 
let coinVaultA = new PublicKey("7Nw66LmJB6YzHsgEGQ8oDSSsJ4YzUkEVAvysQuQw7tC4"); 
let pcVaultA = new PublicKey("EsDTx47jjFACkBhy48Go2W7AQPk4UxtT4765f3tpK21a"); 
let vaultSignerA = new PublicKey("C5v68qSzDdGeRcs556YoEMJNsp8JiYEiEhw2hVUR8Z8y"); 
let openOrdersA =new PublicKey("5C9jFdNh7fFpmbgNgLyLk9SqUGQDznMv1pXTn3aUgodx"); 
let orderPayerTokenAccountA = new PublicKey("FGcdzRDBgsjci2qpqgx9Ap85jEe8WPzbMBLrCNkCxdst"); 
let coinWalletA = new PublicKey("FGcdzRDBgsjci2qpqgx9Ap85jEe8WPzbMBLrCNkCxdst "); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");

*/


/*
//ETHUSDC => USDCRAY (amount : 0.0002, decimal : 8,6) => success +0.4
//TX: https://explorer.solana.com/tx/3L8BeDhscMeXisy1zP5eqsRBGsy321uF92bPyFegWdA9oC6tiasEiJe52KqjemfcZ8QRwxAN8mo8M83LhxQygre7


let marketA = new PublicKey("8Gmi2HhZmwQPVdCwzS7CM66MGstMXPcTVHA7jF19cLZz"); 
let requestQueueA =new PublicKey("3ZSxZjD8o8JjPX1HVmQ59ED89R3uKNviRDCEmxCgv9dp"); 
let eventQueueA =new PublicKey("3z4QQPFdgNSxazqEAzmZD5C5tJWepczimVqWak2ZPY8v"); 
let bidsA = new PublicKey("3nXzH1gYKM1FKdSLHM7GCRG76mhKwyDjwinJxAg8jjx6"); 
let asksA = new PublicKey("b3L5dvehk48X4mDoKzZUZKA4nXGpPAMFkYxHZmsZ98n");
let coinVaultA = new PublicKey("8cCoWNtgCL7pMapGZ6XQ6NSyD1KC9cosUEs4QgeVq49d"); 
let  pcVaultA = new PublicKey("C7KrymKrLWhCsSjFaUquXU3SYRmgYLRmMjQ4dyQeFiGE"); 
let vaultSignerA = new PublicKey("FG3z1H2BBsf5ekEAxSc1K6DERuAuiXpSdUGkYecQrP5v"); 
let openOrdersA =new PublicKey("XPYQ6iGuWtKUimDiXo55Y2gmrkH1Vhh4sPdS47nPgre"); 
let orderPayerTokenAccountA = new PublicKey("Gp8WCR1rCxY6pnR5rWEYk82ESyFYGi4MQiACQQhcCFi2"); 
let coinWalletA = new PublicKey("Gp8WCR1rCxY6pnR5rWEYk82ESyFYGi4MQiACQQhcCFi2"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//renBTCUSDC => USDCRAY (amount :0.0001, decimal : 8,6) => success +1.8
//Tx: https://explorer.solana.com/tx/3dDfArnwBvV6mY5YNRQV1A6U3J4KEUndU3Li9b7nqjGNDPDkhz2833uvnVFGvpQgCSMFRT5Qp66B1osKJ7JdxohA
 

let marketA = new PublicKey("74Ciu5yRzhe8TFTHvQuEVbFZJrbnCMRoohBK33NNiPtv"); 
let requestQueueA =new PublicKey("AnTBLZLekWdq1ybRQHxsJaBWjdS6N6KTjJJ65piFJ3sz"); 
let eventQueueA =new PublicKey("7RbmehbSunJLpg7N6kaCX5SenR1N79xHN8jKnuvXoEHC"); 
let bidsA = new PublicKey("B1xjpD5EEVtLWnWioHc7pCJLj1WVGyKdyMV1NzY4q5pa"); 
let asksA = new PublicKey("6NZf4f6dxxv83Bdfiyf1R1vMFo5QP8BLB862qrVkmhuS"); 
let coinVaultA = new PublicKey("EqnX836tGG4PYSBPgzzQecbTP47AZQRVfcy4RqQW8F3D"); 
let  pcVaultA = new PublicKey("7yiA6p6BXxZwcm38St3vTzyGNEmZjw8x7Ko2nyTfvVx3"); 
let vaultSignerA = new PublicKey("9aZNHmGZrNnB3fKmBj5B9oD7moA1nFviZqNUSkx2tctg"); 
let openOrdersA =new PublicKey("FEjvUYQeh75xJAvQivQhK3Bq4AhQh6DejPysa8RfeKLn"); 
let orderPayerTokenAccountA = new PublicKey("Giuf3zofibYJ2srAcrCQ1CNSv6TsxHgH61n8ggHgiAPd"); 
let coinWalletA = new PublicKey("Giuf3zofibYJ2srAcrCQ1CNSv6TsxHgH61n8ggHgiAPd"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
//BNBUSDC => USDCRAY (amount :0.001 , decimal : 8 ,6) => success +0.4 
//TX: https://explorer.solana.com/tx/4DnPF7U7zF6XgWnzbzEfom6PvKbv2aHPXGMnUMTRLo4YkT2Cm5KRnDZL2aWzqB3V3AUjYYFmKxsKrgJ8FsMNTdaY

let marketA = new PublicKey("4UPUurKveNEJgBqJzqHPyi8DhedvpYsMXi7d43CjAg2f"); 
let requestQueueA =new PublicKey("DzYpcbvi32Me2KTRnpa18VxDU1VP57nHHS7Ks2wEs9KL"); 
let eventQueueA =new PublicKey("DK7Jw2fZCbTVDF191eXywDFymmbXqGUp4VuERiX6RAR4"); 
let bidsA = new PublicKey("XHJx6VrtEjpHhTQVt7KSapsTf63BqrStuFd3X3LSovP"); 
let asksA = new PublicKey("4wZkXYKNcnkkf2ALX3ktRDCuj8Sj1dd2L4APxcKDpgwG"); 
let coinVaultA = new PublicKey("7SjACG2xPdt9ur1Shdav6SwBnr58wRZPxLegJX3e2vhT"); 
let  pcVaultA = new PublicKey("HrxG4K4xSpRfPxSGtMQnnbKRo3r6F2Qj1eyDZXFvP7pe"); 
let vaultSignerA = new PublicKey("xns66Y3kLdMA7aVZciP5pdc46oBD9QHjUrnfTVF3PWp"); 
let openOrdersA =new PublicKey("AR9jdkrBMdttZaZJDRe9znXkGpSTHPgTD2JTmynxs2W3"); 
let orderPayerTokenAccountA = new PublicKey("GkfQmgr9R4xiCNYs4Tf3NCAcmzzAjstmQ7q7ggbpg8mT"); 
let coinWalletA = new PublicKey("GkfQmgr9R4xiCNYs4Tf3NCAcmzzAjstmQ7q7ggbpg8mT"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
// WBTCUSDC=> USDCRAY (amount :0.0001 , decimal : 6 ,6) => success +3.4 
//TX: https://explorer.solana.com/tx/59Uzc4zGnPMccgNCPzTPXZfEy1J47KkUEUHcRaiW6S6pE4kJ34VjqHmix3ePKfzCYnafbEyztnmEt4Ny4pXNjnJ2

let marketA = new PublicKey("A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw"); 
let requestQueueA =new PublicKey("H6UaUrNVELJgTqao1CNL4252kShLKSfwoboT8tF7HNtB"); 
let eventQueueA =new PublicKey("6NQqaa48SnBBJZt9HyVPngcZFW81JfDv9EjRX2M4WkbP"); 
let bidsA = new PublicKey("6wLt7CX1zZdFpa6uGJJpZfzWvG6W9rxXjquJDYiFwf9K"); 
let asksA = new PublicKey("6EyVXMMA58Nf6MScqeLpw1jS12RCpry23u9VMfy8b65Y"); 
let coinVaultA = new PublicKey("GZ1YSupuUq9kB28kX9t1j9qCpN67AMMwn4Q72BzeSpfR"); 
let pcVaultA = new PublicKey("7sP9fug8rqZFLbXoEj8DETF81KasaRA1fr6jQb6ScKc5"); 
let vaultSignerA = new PublicKey("GBWgHXLf1fX4J1p5fAkQoEbnjpgjxUtr4mrVgtj9wW8a"); 
let openOrdersA =new PublicKey("2sc7oTtAy2xRHBmABMv8zQ8AFaXuqTfVqWAznB2DwXvt"); 
let orderPayerTokenAccountA = new PublicKey("ELEkdHn8XGDfjWvXiYYWyvdx3J4mvDLJbf7CqKa6Z2MB"); 
let coinWalletA = new PublicKey("ELEkdHn8XGDfjWvXiYYWyvdx3J4mvDLJbf7CqKa6Z2MB"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//WSOLUSDC => USDCRAY (amount :0.1 , decimal : 9 ,6) => success +5.8
//TX: https://explorer.solana.com/tx/5xqZ6bLbsBoeuNciYDG27mUkAVAs2oj7EWaJUvvQqS5VvAskKUF6KDaCdEHKAPCZiFjctau62xQXACSNawNYjggT

let marketA = new PublicKey("9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"); 
let requestQueueA =new PublicKey("AZG3tFCFtiCqEwyardENBQNpHqxgzbMw8uKeZEw2nRG5"); 
let eventQueueA =new PublicKey("5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht"); 
let bidsA = new PublicKey("14ivtgssEBoBjuZJtSAPKYgpUK7DmnSwuPMqJoVTSgKJ"); 
let asksA = new PublicKey("CEQdAFKdycHugujQg9k2wbmxjcpdYZyVLfV9WerTnafJ"); 
let coinVaultA = new PublicKey("36c6YqAwyGKQG66XEp2dJc5JqjaBNv7sVghEtJv4c7u6"); 
let  pcVaultA = new PublicKey("8CFo8bL8mZQK8abbFyypFMwEDd8tVJjHTTojMLgQTUSZ"); 
let vaultSignerA = new PublicKey("F8Vyqk3unwxkXukZFQeYyGmFfTG3CAX4v24iyrjEYBJV"); 
let openOrdersA =new PublicKey("4PB42F9Tf6NvMCYRf8fWYYV7KcoaM4511MQpbf9UV8DW"); 
let orderPayerTokenAccountA = new PublicKey("28ia6kxKBL8HNNTSmmqGpKnbtH8WcWzqqHfavt9zw6HC"); 
let coinWalletA = new PublicKey("28ia6kxKBL8HNNTSmmqGpKnbtH8WcWzqqHfavt9zw6HC"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
//mSOLUSDC  => USDCRAY (amount :0.1 , decimal : 9 ,6) => success +6.2
//TX: https://explorer.solana.com/tx/5uK6sFKtH738zd6av1E497MgELTAdSi4Vtd66g1HNwyqPD2XQtD2GHuadEwtCDcGQG6MrZNBRtgJGBcZZLKb3QQm


let marketA = new PublicKey("6oGsL2puUgySccKzn9XA9afqF217LfxP5ocq4B3LWsjy"); 
let requestQueueA =new PublicKey("EHUoDPVVKR5Udp4EZPb4bsHZte5EEHc1PPTPXBgJEPEK"); 
let eventQueueA =new PublicKey("BC8Tdzz7rwvuYkJWKnPnyguva27PQP5DTxosHVQrEzg9"); 
let bidsA = new PublicKey("8qyWhEcpuvEsdCmY1kvEnkTfgGeWHmi73Mta5jgWDTuT"); 
let asksA = new PublicKey("PPnJy6No31U45SVSjWTr45R8Q73X6bNHfxdFqr2vMq3"); 
let coinVaultA = new PublicKey("2y3BtF5oRBpLwdoaGjLkfmT3FY3YbZCKPbA9zvvx8Pz7"); 
let  pcVaultA = new PublicKey("6w5hF2hceQRZbaxjPJutiWSPAFWDkp3YbY2Aq3RpCSKe"); 
let vaultSignerA = new PublicKey("9dEVMESKXcMQNndoPc5ji9iTeDJ9GfToboy8prkZeT96"); 
let openOrdersA =new PublicKey("FqxEHrevGfchukPpLmw4CrSZkawV31zLrBLTduoAuBft"); 
let orderPayerTokenAccountA = new PublicKey("EfjzF4Spp1VsdjpZy3Feha9h1CmzsT6vE3AoUhktGoAy"); 
let coinWalletA = new PublicKey("EfjzF4Spp1VsdjpZy3Feha9h1CmzsT6vE3AoUhktGoAy"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//USDHUSDC  => USDCRAY (amount :1 , decimal : 9 ,6) => error

let marketA = new PublicKey("CaFjigEgJdtGPxQxRjneA1hzNcY5MsHoAAL6Et67QrC5"); 
let requestQueueA =new PublicKey("DjWSMT3CAT8t3j35Vt9uwQ14V9gucK1MJgBD2tLKXvWk"); 
let eventQueueA =new PublicKey("DMPcCyyqqDhxU852FU6rP6bCy6dfWGWjg2KF21y9DFt4"); 
let bidsA = new PublicKey("AXTKA59Xd53s5a26PNALtnmqfJUWzdyuPN1w5qFMHGio"); 
let asksA = new PublicKey("HUCmvkqFdwixBBMm2vMgaBfJ5ArY5b7RqfYbACjCPhpp"); 
let coinVaultA = new PublicKey("3E3J4Ua9DPM5fdmRxB1AM6S5NqbhBh9exudHcs5jgumz"); 
let  pcVaultA = new PublicKey("D6xgt4XSTRFAqctmY5byT4Ji7mvTihfnuNxjJWPETe7M"); 
let vaultSignerA = new PublicKey("PmGWi4jXyde5y4ed8GdF1Son68LioBRGuazkCoJM8B2"); 
let openOrdersA =new PublicKey("5VVtSrWme6fvfboGAysEvBivMxUH9JTehCusCsB9nst8"); 
let orderPayerTokenAccountA = new PublicKey("FDRCdhcPU4Xch8GL52qF86Jnc7a4uc2odEz627nD91Yf"); 
let coinWalletA = new PublicKey("FDRCdhcPU4Xch8GL52qF86Jnc7a4uc2odEz627nD91Yf"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//stSOLUSDC => USDCRAY (amount:0.1 , decimal : 9,6) => success : +6.2
//TX: https://explorer.solana.com/tx/2PNMkMrCVr1VwQZpmUybZa6Gm9V8Y8eFf9t1A3yVdYSKgZSJgyBsKnxh55HNwoJ557nSsA2eAAoDTdMimMouGunt


let marketA = new PublicKey("5F7LGsP1LPtaRV7vVKgxwNYX4Vf22xvuzyXjyar7jJqp"); 
let requestQueueA =new PublicKey("AA1dDhWSPogxPnNw1cuwuDz9cKhpN6jK8C7CkDpRUiom"); 
let eventQueueA =new PublicKey("CQY7LwdZJrfLRZcmEzUYp34XJbxhnxgF4UXmLKqJPLCk"); 
let bidsA = new PublicKey("HjJSzUbis6VhBZLCbSFN1YtvWLLdxutb7WEvymCLrBJt"); 
let asksA = new PublicKey("9e37wf6QUqe2s4J6UUNsuv6REQkwTxd47hXhDanm1adp"); 
let coinVaultA = new PublicKey("4gqecEySZu6SEgCNhBJm7cEn2TFqCMsMNoiyski5vMTD"); 
let  pcVaultA = new PublicKey("6FketuhRzyTpevhgjz4fFgd5GL9fHeBeRsq9uJvu8h9m"); 
let vaultSignerA = new PublicKey("x1vRSsrhXkSn7xzJfu9mYP2i19SPqG1gjyj3vUWhim1"); 
let openOrdersA =new PublicKey("HmgGHnGV8kL8dcyLdKUwGqxdJ4LKfwWH8Josx9RUgSn8"); 
let orderPayerTokenAccountA = new PublicKey("CwNk64yyyobgwjZLSQsoH2qoBoxz7gZdXjgbV3kiKwK8"); 
let coinWalletA = new PublicKey("CwNk64yyyobgwjZLSQsoH2qoBoxz7gZdXjgbV3kiKwK8"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/


/*
//PORTUSDC => USDCRAY (amount:2.9 , decimal : 6,6) => SUCCES +0.2
//TX: https://explorer.solana.com/tx/5BovWNKRJjjhbvXNpyg4dZsAQpN3e6vuh4n88Cmn1DXQUYrDoUxhuW5Hrjhqhc6vCZDPaAmcyRmHTUbSJ1cYMoTw

let marketA = new PublicKey("8x8jf7ikJwgP9UthadtiGFgfFuyyyYPHL3obJAuxFWko"); 
let requestQueueA =new PublicKey("3ZC5LMTDm3qWKhmPJ4HRMA3Bepwhcf7DuVVzDXdwVmnZ"); 
let eventQueueA =new PublicKey("8ptDxtRLWXAKYQYRoRXpKmrJje31p8dsDsxeZHEksqtV"); 
let bidsA = new PublicKey("9Y24T3co7Cc7cGbG2mFc9n3LQonAWgtayqfLz3p28JPa"); 
let asksA = new PublicKey("8uQcJBapCnxy3tNEB8tfmssUvqYWvuCsSHYtdNFbFFjm"); 
let coinVaultA = new PublicKey("8rNKJFsd9yuGx7xTTm9sb23JLJuWJ29zTSTznGFpUBZB"); 
let  pcVaultA = new PublicKey("5Vs1UWLxZHHRW6yRYEEK3vpzE5HbQ8BFm27PnAaDjqgb"); 
let vaultSignerA = new PublicKey("63ZaXnSj7SxWLFEcjmK79fyGokJxhR3UEXomN7q7Po25"); 
let openOrdersA =new PublicKey("5kGgpWYVH2CpMZeVEMpUJ98wS1XyuBKHZp3XQR5HWGCt"); 
let orderPayerTokenAccountA = new PublicKey("91dXtU1iLMCU7aUZ3hfUjMhviE4mvFxpHgrXkXHnuEEj"); 
let coinWalletA = new PublicKey("91dXtU1iLMCU7aUZ3hfUjMhviE4mvFxpHgrXkXHnuEEj"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/

/*
//SBRUSDC => USDCRAY (amount : 255, decimal :6,6)=> success +1
//TX : https://explorer.solana.com/tx/21efGPW29KYbzXVgU6MbwLTkj7L4LrTcBgHbhT7caNoPozKV4tpbwPN36S2Lo3FhMKV5orZucToEea1URAN78w3V
let marketA = new PublicKey("HXBi8YBwbh4TXF6PjVw81m8Z3Cc4WBofvauj5SBFdgUs"); 
let requestQueueA =new PublicKey("iwa5jrLEdmzTxvR7iNUL4jrNK9g8aGeCPj1sdLHwwmP"); 
let eventQueueA =new PublicKey("EUre4VPaLh7B95qG3JPS3atquJ5hjbwtX7XFcTtVNkc7"); 
let bidsA = new PublicKey("FdGKYpHxpQEkRitZw6KZ8b21Q2mYiATHXZgJjFDhnRWM"); 
let asksA = new PublicKey("cxqTRyeoGeh6TBEgo3NAieHaMkdmfZiCjSEfkNAe1Y3"); 
let coinVaultA = new PublicKey("38r5pRYVzdScrJNZowNyrpjVbtRKQ5JMcQxn7PgKE45L"); 
let  pcVaultA = new PublicKey("4YqAGXQEQTQbn4uKX981yCiSjUuYPV8aCajc9qQh3QPy"); 
let vaultSignerA = new PublicKey("84aqZGKMzbr8ddA267ML7JUTAjieVJe8oR1yGUaKwP53"); 
let openOrdersA =new PublicKey("3H1nasPyaq9TbT4ecWCEeyAV4CH59BPcDiErzBY8MNDW"); 
let orderPayerTokenAccountA = new PublicKey("CjLNtjwebHkdN6SyELKVEFw2Sr9RWj8pPdceRdMdSwVg"); 
let coinWalletA = new PublicKey("CjLNtjwebHkdN6SyELKVEFw2Sr9RWj8pPdceRdMdSwVg"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");


let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/




/*
  // NOVAUSDC => USDCRAY (amount: 6 , decimal : 9,6) => succes +0.1
  //TX: https://explorer.solana.com/tx/3GozFszf58mV1vBWvz9SxbxwQhYLYef8RRZzFYrx71pa9uh5vczBd2Y9QC6W3DAmBmkNr8VAaj2KMHs8r8TJvDeT

  let marketA = new PublicKey("2awwFbLKpdD6xkRQgL5iPeyqfwGcVZ6HLZsyEUbVmt4y");
  let requestQueueA =new PublicKey("EVTHFYoJ23M5LqzrZPiLb9TtYKiS96vpA5rykEQKwR1P"); 
  let eventQueueA = new PublicKey("PG2uT1p3bj7REDuuRJtiewj9hXw9B9ZS5wL4HrxGCx4"); 
  let bidsA = new PublicKey("B5mQjV9LH7JbQDCUyVv45DnrhN6fx29as6BnzfycHtNY");
  let asksA = new PublicKey("AXrbvLmZkm6BEyFpQHSF8KYsLYRkXyRCgYDHspuWNgHT"); 
  let coinVaultA = new PublicKey("6vgeDbCJNwvsAnUPZPQg8LJQj3PAjfKjbN9QxZMPx8Qp")  ;
  let pcVaultA =new PublicKey("6S7ZwqyrnUecBhzoKKbJdaykKVAXLprbfk7aMxQMJ67j"); 
  let vaultSignerA = new PublicKey("6Nuytrm9iwaW2DKP9GN2MrnXzAeZaz4EWEBTaK316g36");
  let openOrdersA = new PublicKey("cQd4ZgnTbpaDY4DpDZpCcpqxLbFm835Un6nrFEDyZkH"); 
  let orderPayerTokenAccountA = new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let coinWalletA =  new PublicKey("9W36TBxWRdsi4Ywo5CJ53xxWDnGgnxjqw3PUCEXYseZa"); 
  let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");

  let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
  */


/*
// GMTUSDC => USDCRAY (decimal : 9=> 6) 

let marketA = new PublicKey("B9HfUpFYPTiCdeGAb79BpJPsJi9mQUkDfSrQBqZh8MBT");
let requestQueueA =new PublicKey("65L6WAMFXtx8o22ifRmuoSdtJP6jKHvJ5GS3FnnB4TXg");
let eventQueueA =new PublicKey("5ez6LguttnWfh5yZ8wWhSKFbvScy7fDReQo6dxisoDzW");
let bidsA = new PublicKey("DscAuvngnKtoQxNmA3LdRVDxmt98tuJyt1r2eXsqgMCh"); 
let asksA = new PublicKey("BTG4BYpHtDqSYvx6UU6sngavnxYBushpG4fExeytzjbC"); 
let coinVaultA = new PublicKey("14QK32hhgvSo8DT6CccL6RZ5dDaKPZfuHVNPHP5kN4Ud");
let  pcVaultA = new PublicKey("F5sZdnLEXsEUzA6gwSYc8PfvVP2fBDio3hcFrPQ8rCCM"); 
let vaultSignerA = new PublicKey("81AEaxUFTabugYjHp1yzGWMTtaVkNh14rNeifzLMhsJp"); 
let openOrdersA =new PublicKey("5HDoseDGuHRG8uAty9AFbSCNhSHSXt9y76dNCXjCWp8f"); 
let orderPayerTokenAccountA = new PublicKey("84TwiHVXqkRVa9ZYw7NWWcqcSLdTdGZgCt8rgJ7E72bb"); 
let coinWalletA= new PublicKey("84TwiHVXqkRVa9ZYw7NWWcqcSLdTdGZgCt8rgJ7E72bb"); 
let pcWalletA = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM");
  
let marketB = new PublicKey("2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep"); 
let requestQueueB = new PublicKey("39mE6bYktM1XAKKmB6WN971X3Sa1yGkHxtCTWMkVrwN2"); 
let eventQueueB = new PublicKey("H9dZt8kvz1Fe5FyRisb77KcYTaN8LEbuVAfJSnAaEABz"); 
let bidsB = new PublicKey("Hf84mYadE1VqSvVWAvCWc9wqLXak4RwXiPb4A91EAUn5"); 
let asksB = new PublicKey("DC1HsWWRCXVg3wk2NndS5LTbce3axwUwUZH1RgnV4oDN"); 
let coinVaultB = new PublicKey("GGcdamvNDYFhAXr93DWyJ8QmwawUHLCyRqWL3KngtLRa"); 
let pcVaultB = new PublicKey("22jHt5WmosAykp3LPGSAKgY45p7VGh4DFWSwp21SWBVe"); 
let vaultSignerB =new PublicKey("FmhXe9uG6zun49p222xt3nG1rBAkWvzVz7dxERQ6ouGw"); 
let openOrdersB = new PublicKey("Dw2KjXmAXYGXNqi3cGh1uDdnLWiJzGwm4TUkA3Remyar"); 
let orderPayerTokenAccountB =new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let coinWalletB = new PublicKey("56PsM9SCdt2TjrdDhaLkTZkrEtgbeWP8eukGyYFcAvsy"); 
let pcWalletB = new PublicKey("JA4ompRJhSRutKp7fLTScEovj3tPeuKnjZ3DekeW1CkM"); 
let authority = new PublicKey("31G1q7ewTacMPvMcoBkVKJ1Ad9LyaNkhJH5S5mxJgT5z"); 
let dexProgram = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"); 
let TOKEN_PROGRAM_ID =  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); 
let swapProgramId =new PublicKey("22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"); 
let rent = new PublicKey("SysvarRent111111111111111111111111111111111");
*/






let user_jawaher=new Account("")
  const  keys= [
      {pubkey: marketA, isSigner: false, isWritable: true},
      {pubkey: requestQueueA, isSigner: false, isWritable: true},
      {pubkey: eventQueueA, isSigner: false, isWritable: true},
      {pubkey: bidsA, isSigner: false, isWritable: true},
      {pubkey: asksA, isSigner: false, isWritable: true},
      {pubkey: coinVaultA, isSigner: false, isWritable: true},//coinVault
      {pubkey: pcVaultA, isSigner: false, isWritable: true},//pcvault
      {pubkey: vaultSignerA, isSigner: false, isWritable: true},//vaultSigner
      {pubkey: openOrdersA, isSigner: false, isWritable: true},//openOrder
      //{pubkey: orderPayerTokenAccountA, isSigner: false, isWritable: false},//orderPayer
      {pubkey: coinWalletA , isSigner: false, isWritable: true},//1 coinWallet // source
      {pubkey: pcWalletA, isSigner: false, isWritable: true},// 2 pcWallet // destination
      {pubkey: marketB, isSigner: false, isWritable: true},
      {pubkey: requestQueueB, isSigner: false, isWritable: true},
      {pubkey: eventQueueB, isSigner: false, isWritable: true},
      {pubkey: bidsB, isSigner: false, isWritable: true},
      {pubkey: asksB, isSigner: false, isWritable: true},
      {pubkey: coinVaultB, isSigner: false, isWritable: true},//coinVault
      {pubkey: pcVaultB, isSigner: false, isWritable: true},//pcvault
      {pubkey: vaultSignerB, isSigner: false, isWritable: true},//vaultSigner
      {pubkey: openOrdersB, isSigner: false, isWritable: true},//openOrder
     // {pubkey: orderPayerTokenAccountB, isSigner: false, isWritable: false},//orderPayer
      {pubkey: coinWalletB , isSigner: false, isWritable: true},//coinWallet // source
      //{pubkey: pcWalletB, isSigner: false, isWritable: true},//pcWallet // destination
      {pubkey: authority, isSigner: true, isWritable: true},
      {pubkey: dexProgram, isSigner: false, isWritable: false},
      {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
      {pubkey: swapProgramId, isSigner: false, isWritable: false},
      {pubkey: rent, isSigner: false, isWritable: false},
    ];


    const dataLayout = BufferLayout.struct([
      uint64('amount_deposit'),
      BufferLayout.u8('from_decimals'),
      BufferLayout.u8('quote_decimals'),
  ]);
  const data = Buffer.alloc(dataLayout.span);
  let amountD:Number=70*1000000; // decimal : 6
  let from_decimals = 6;
  let quote_decimals = 9;

  dataLayout.encode({
    //@ts-ignore
    amount_deposit: new u64(amountD).toBuffer(),
    from_decimals,
    quote_decimals
},
    data,
);


    const instruction = new TransactionInstruction({
    keys,
    programId,
    data
  });

  const transaction = new Transaction();
  transaction.add(instruction);
  let SetComputeUnitLimitParams ={
    units: 400000
  }
  
transaction.add(ComputeBudgetProgram.setComputeUnitLimit(SetComputeUnitLimitParams))
 let tx=  await sendAndConfirmTransaction(
    connection,
    transaction,
    [user_jawaher],
  );

  console.log ("tx swap transitive :", tx);
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportGreetings(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(greetedPubkey);
  if (accountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const greeting = borsh.deserialize(
    GreetingSchema,
    GreetingAccount,
    accountInfo.data,
  );
  console.log(
    greetedPubkey.toBase58(),
    'has been greeted',
    greeting.counter,
    'time(s)',
  );
}
