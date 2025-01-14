import { Contract } from '@herajs/client';
import { keccak256 } from 'web3-utils';
import { BigNumber } from "bignumber.js";
import { checkAergoAddress, checkEthereumAddress, checkTokenId } from './utils';


/* Ethereum -> Aergo ERC20 token transfer */
/* ====================================== */


/**
 * Increase approval so the bridge contract can pull assets
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {string} spender 0x Address able to spend on behalf of asset owner
 * @param {string} amount Spendable amount by spender (string with 10^18 decimals)
 * @param {string} erc20Addr 0x Address of asset 
 * @param {object} erc20Abi Erc20 ABI array
 * @return {Promise} Promise from web3js send transaction
 */
export function increaseApproval(
    web3, 
    spender, 
    amount, 
    erc20Addr, 
    erc20Abi,
    gasLimit=300000,
) {
    checkEthereumAddress(spender);
    checkEthereumAddress(erc20Addr);
    const contract = new web3.eth.Contract(erc20Abi, erc20Addr);
    let promise;
    try {
        promise = contract.methods.increaseAllowance(spender, amount).send(
            {from: web3.eth.defaultAccount, gas: 300000}
        );
        return promise;
    } catch(error) {
        if (!error instanceof TypeError) {
            return promise;
        }
    }
    console.log("increaseAllowance() not in abi, trying increaseApproval()");
    return contract.methods.increaseApproval(spender, amount).send(
        {from: web3.eth.defaultAccount, gas: gasLimit}
    );
}

/**
 * Lock assets in the Ethereum bridge contract
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} erc20Addr 0x Address of asset
 * @param {string} amount Amount to lock (string with 10^18 decimals)
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {object} bridgeEthAbi Bridge ABI array
 * @return {Promise} Promise from web3js send transaction
 */
export function lock(
    web3, 
    receiverAergoAddr, 
    erc20Addr, 
    amount, 
    bridgeEthAddr, 
    bridgeEthAbi,
    gasLimit=300000,
) {
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(erc20Addr);
    checkEthereumAddress(bridgeEthAddr);
    const contract = new web3.eth.Contract(bridgeEthAbi, bridgeEthAddr);
    return contract.methods.lock(erc20Addr, amount, receiverAergoAddr).send(
        {from: web3.eth.defaultAccount, gas: gasLimit}
    );
}

/**
 * Get the unfreezable and pending amounts transfering through the bridge
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverAergoAddr Aergo address of receiver of unfreezed aergo tokens
 * @param {string} aergoErc20Addr 0x Address of aergo erc20
 * @return {string, string} Amount withdrawable now, amount pending new state root anchor (string with 10^18 decimals)
 */
export async function unfreezable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverAergoAddr, 
    aergoErc20Addr, 
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(aergoErc20Addr);
    // _locks is the 6th var in EthMerkleBridge contract
    const position = Buffer.concat([Buffer.alloc(31), Buffer.from("05", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverAergoAddr, 'utf-8'), 
        Buffer.from(aergoErc20Addr.slice(2), 'hex')
    ]);
    const ethTrieKey = keccak256(Buffer.concat([accountRef, position]));
    const aergoStorageKey = Buffer.concat([
        Buffer.from('_sv__unfreezes-'.concat(receiverAergoAddr), 'utf-8'),
        Buffer.from(aergoErc20Addr.slice(2), 'hex')
    ]);
    return withdrawable(web3, hera, bridgeEthAddr, bridgeAergoAddr, ethTrieKey,
        aergoStorageKey);
}

/**
 * Get the mintable and pending amounts transfering through the bridge
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverAergoAddr Aergo address of receiver of unfreezed aergo tokens
 * @param {string} erc20Addr 0x Address of erc20 token
 * @return {string, string} Amount withdrawable now, amount pending new state root anchor (string with 10^18 decimals)
 */
export async function mintable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverAergoAddr, 
    erc20Addr, 
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(erc20Addr);
    // _locks is the 6th var in EthMerkleBridge contract
    const position = Buffer.concat([Buffer.alloc(31), Buffer.from("05", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverAergoAddr, 'utf-8'), 
        Buffer.from(erc20Addr.slice(2), 'hex')
    ]);
    const ethTrieKey = keccak256(Buffer.concat([accountRef, position]));
    const aergoStorageKey = Buffer.concat([
        Buffer.from('_sv__mints-'.concat(receiverAergoAddr), 'utf-8'),
        Buffer.from(erc20Addr.slice(2), 'hex')
    ]);
    return withdrawable(web3, hera, bridgeEthAddr, bridgeAergoAddr, ethTrieKey,
        aergoStorageKey);
}


/**
 * Build a lock proof from Ethereum 
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} erc20Addr 0x Address of asset
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @return {Promise} Promise from eth_getProof
 */
export async function buildLockProof(
    web3, 
    hera, 
    receiverAergoAddr, 
    erc20Addr, 
    bridgeEthAddr, 
    bridgeAergoAddr
) {
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(erc20Addr);
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    // build lock proof in last merged height 
    // user should have waited and checked withdrawable amount
    // UI should monitor new anchor so that minting doesnt fail just after a new anchor
    // _locks is the 6th var in EthMerkleBridge contract
    const position = Buffer.concat([Buffer.alloc(31), Buffer.from("05", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverAergoAddr, 'utf-8'), 
        Buffer.from(erc20Addr.slice(2), 'hex')
    ]);
    const ethTrieKey = keccak256(Buffer.concat([accountRef, position]));
    return buildDepositProof(
        web3, hera, bridgeEthAddr, 
        bridgeAergoAddr, ethTrieKey
    );
}

/**
 * Build hera mint tx object to be sent to Aergo Connect for signing and broadcasting
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} txSender Aergo address of account signing the transaction
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {json} bridgeAergoAbi Abi of Aergo bridge contract
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} erc20Addr 0x Address of erc20 token
 * @return {object} Herajs tx object
 */
export async function buildMintTx(
    web3,
    hera, 
    txSender,
    bridgeEthAddr,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverAergoAddr, 
    erc20Addr,
    gasLimit=300000,
) {
    checkAergoAddress(txSender);
    const proof = await buildLockProof(
        web3, hera, receiverAergoAddr, erc20Addr, bridgeEthAddr, 
        bridgeAergoAddr
    );
    const ap = proof.storageProof[0].proof;
    const balance = {_bignum:proof.storageProof[0].value};
    const args = [receiverAergoAddr, balance, erc20Addr.slice(2).toLowerCase(), ap];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.mint(...args).asTransaction({
        from: txSender,
        limit: gasLimit,
    });
    return builtTx;
}


/**
 * Build hera tx object to be send to Aergo Connect for signing and broadcasting
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} txSender Aergo address of account signing the transaction
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {json} bridgeAergoAbi Abi of Aergo bridge contract
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} erc20Addr 0x Address of aergo erc20 token
 * @return {object} Herajs tx object
 */
export async function buildUnfreezeTx(
    web3,
    hera, 
    txSender,
    bridgeEthAddr,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverAergoAddr, 
    aergoErc20Addr,
    gasLimit=300000,
) {
    checkAergoAddress(txSender);
    const proof = await buildLockProof(
        web3, hera, receiverAergoAddr, aergoErc20Addr, bridgeEthAddr, 
        bridgeAergoAddr
    );
    const ap = proof.storageProof[0].proof;
    const balance = {_bignum:proof.storageProof[0].value};
    const args = [receiverAergoAddr, balance, ap];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.unfreeze(...args).asTransaction({
        from: txSender,
        limit: gasLimit,
    });
    return builtTx;
}


/* Ethereum -> Aergo pegged ARC1 token transfer */
/* ============================================ */

export function burn() {
    throw new Error('Not implemented');
}
export function unlockable() {
    throw new Error('Not implemented');
}
export function buildBurnProof() {
    throw new Error('Not implemented');
}
export function unlock() {
    throw new Error('Not implemented');
}



/* Ethereum -> Aergo helpers */
/* ========================= */

/**
 * Build a deposit proof from Ethereum (Lock or Burn)
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} ethTrieKey 0x Hash
 * @return {Promise} Promise from eth_getProof
 */
async function buildDepositProof(
    web3, 
    hera, 
    bridgeEthAddr, 
    bridgeAergoAddr, 
    ethTrieKey
) {
    const contract = Contract.atAddress(bridgeAergoAddr);
    // check last merged height
    let query = contract.queryState("_sv__anchorHeight");
    const lastMergedHeight = await hera.queryContractState(query);
    const proof = await web3.eth.getProof(
        bridgeEthAddr, [ethTrieKey], lastMergedHeight);
    // TODO proof verification
    return proof;
}


/**
 * Get the withdrawable and pending amounts transfering through the bridge
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} ethTrieKey 0x Hash
 * @param {Buffer} aergoStorageKey  key storage bytes (before hashing)
 * @return {string, string} Amount withdrawable now, amount pending new state root anchor (string with 10^18 decimals)
 */
async function withdrawable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    ethTrieKey,
    aergoStorageKey
) {
    // totalDeposit : total latest deposit including pending
    let storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, ethTrieKey, 'latest');
    const totalDeposit = new BigNumber(storageValue);

    // get total withdrawn and last anchor height
    const aergoBridge = Contract.atAddress(bridgeAergoAddr);
    const query = aergoBridge.queryState(
        ["_sv__anchorHeight", aergoStorageKey]);
    let [lastAnchorHeight, totalWithdrawn] = await hera.queryContractState(query);
    if (totalWithdrawn === undefined) {
        totalWithdrawn = 0;
    }
    totalWithdrawn = new BigNumber(totalWithdrawn);

    // get anchored deposit : total deposit before the last anchor
    storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, ethTrieKey, lastAnchorHeight);
    const anchoredDeposit = new BigNumber(storageValue);

    // calculate withdrawable and pending
    const withdrawableBalance = anchoredDeposit.minus(totalWithdrawn).toString(10);
    const pending = totalDeposit.minus(anchoredDeposit).toString(10);
    return [withdrawableBalance, pending];
}

function buildLockERC721TrieKey(receiverAergoAddr, tokenId, erc721Addr) {
    // _locksERC721 is the 10th var in EthMerkleBridge contract
    const position = Buffer.concat([Buffer.alloc(31), Buffer.from("09", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverAergoAddr, 'utf-8'),
        Buffer.from(tokenId, 'utf-8'),
        Buffer.from(erc721Addr.slice(2), 'hex')
    ]);
    return keccak256(Buffer.concat([accountRef, position]));
}

/**
 * 이더리움 상에서 락하고 아르고 상에서 민트 가능한지 확인하는 용도
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverAergoAddr Aergo address of receiver of unfreezed aergo tokens
 * @param {string} tokenId locked ERC721 tokenId to mint ARC2 on aergo
 * @param {string} erc721Addr 0x Address of erc721 token
 * @return {string, string} Status(minted, mintable, error), and message
 */
 export async function validateARC2Mintable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverAergoAddr,
    tokenId,
    erc721Addr,
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(erc721Addr);
    checkTokenId(tokenId);

    const ethTrieKey = buildLockERC721TrieKey(receiverAergoAddr, tokenId, erc721Addr);
  
    let storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, ethTrieKey, 'latest');
    if (storageValue === undefined) {
        throw Error('given token (' + tokenId + ') is not locked');
    }
    const lockBlockNumOnEth = new BigNumber(storageValue);

    if(lockBlockNumOnEth.eq(new BigNumber(0))){
        throw Error('Token does not locked on Ethereum, or Check your input is valid');
    }
    
    const aergoStorageKey = Buffer.concat([
        Buffer.from('_sv__mintsARC2-'.concat(receiverAergoAddr), 'utf-8'),
        Buffer.from(tokenId, 'utf-8'),
        Buffer.from(erc721Addr.slice(2), 'hex')
    ]);
    // get total withdrawn and last anchor height
    const aergoBridge = Contract.atAddress(bridgeAergoAddr);
    const query = aergoBridge.queryState(aergoStorageKey);
    let mintedOnAergo = 0;
    try {
        mintedOnAergo = await hera.queryContractState(query);
    } catch(err) {
        // when state does not exist
        // do not handling
        console.error(err);
    }

    if(mintedOnAergo === undefined) {
        return; // ok
    }

    mintedOnAergo = new BigNumber(mintedOnAergo);

    if(lockBlockNumOnEth.eq(mintedOnAergo)) {
        throw Error('The Token is Already Minted on Aergo');
    } 
}


/**
 * Build hera mint ARC2 tx object to be sent to Aergo Connect for signing and broadcasting
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} txSender Aergo address of account signing the transaction
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {json} bridgeAergoAbi Abi of Aergo bridge contract
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} tokenId locked ERC721 tokenId to mint ARC2 on aergo
 * @param {string} erc721Addr 0x Address of erc721 token
 * @return {object} Herajs tx object
 */
 export async function buildUnlockERC721Tx(
    web3,
    hera, 
    txSender,
    bridgeEthAddr,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverAergoAddr,
    tokenId,
    erc721Addr,
    gasLimit=300000,
) {
    checkAergoAddress(txSender);
    
    const proof = await buildLockERC721Proof(
        web3, hera, receiverAergoAddr, tokenId, erc721Addr, bridgeEthAddr, 
        bridgeAergoAddr
    );
    const ap = proof.storageProof[0].proof;
    const lockERC721BlockNum = {_bignum:proof.storageProof[0].value};
    const args = [receiverAergoAddr, tokenId, lockERC721BlockNum, erc721Addr.slice(2).toLowerCase(), ap];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.mintARC2(...args).asTransaction({
        from: txSender,
        limit: gasLimit,
    });
    return builtTx;
}


/**
 * Build a lock proof from Ethereum 
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} receiverAergoAddr Aergo address that receive minted/unfeezed tokens
 * @param {string} tokenId locked ERC721 tokenId to mint ARC2 on aergo
 * @param {string} erc721Addr 0x Address of asset
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @return {Promise} Promise from eth_getProof
 */
 export async function buildLockERC721Proof(
    web3, 
    hera, 
    receiverAergoAddr,
    tokenId,
    erc721Addr, 
    bridgeEthAddr, 
    bridgeAergoAddr
) {
    checkAergoAddress(receiverAergoAddr);
    checkEthereumAddress(erc721Addr);
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkTokenId(tokenId);
    // build lock proof of ERC721 in last merged height 
    const ethTrieKey = buildLockERC721TrieKey(receiverAergoAddr, tokenId, erc721Addr);

    return buildDepositProof(
        web3, hera, bridgeEthAddr, 
        bridgeAergoAddr, ethTrieKey
    );
}
