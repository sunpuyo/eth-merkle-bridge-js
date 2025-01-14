import { Contract } from '@herajs/client';
import { keccak256 } from 'web3-utils';
import { BigNumber } from 'bignumber.js';
import { checkAergoAddress, checkEthereumAddress, checkTokenId } from './utils';

/* Aergo -> Ethereum ARC1 token transfer */
/* ===================================== */

export function lock() {
    throw new Error('Not implemented');
}
export function mintable() {
    throw new Error('Not implemented');
}
export function buildLockProof() {
    throw new Error('Not implemented');
}
export function mint() {
    throw new Error('Not implemented');
}

/* Aergo -> Ethereum pegged ERC20 token transfer */
/* ============================================= */

/**
 * Build tx to burn tokens minted by aergo bridge contract
 * @param {string} txSender Aergo address of account signing the tx
 * @param {string} amount Amount to freeze (string with 10^18 decimals)
 * @param {string} mintedArc1Addr Aergo address of token to burn
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {json} bridgeAergoAbi Abi of Aergo bridge contract
 * @param {string} receiverEthAddr 0x eth address to receive unlocked tokens
 * @return {object} Herajs tx object
 */
export async function buildBurnTx(
    txSender,
    amount,
    mintedArc1Addr,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverEthAddr, 
    gasLimit=300000,
) {
    checkAergoAddress(txSender);
    checkAergoAddress(mintedArc1Addr);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    const args = [receiverEthAddr.slice(2).toLowerCase(), {_bignum: amount}, mintedArc1Addr];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.burn(...args).asTransaction({
        from: txSender,
        limit: gasLimit,
    });
    return builtTx;
}

/**
 * Build tx to freeze aergo in bridge contract
 * @param {string} txSender Aergo address of account signing the tx
 * @param {string} amount Amount to freeze (string with 10^18 decimals)
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {json} bridgeAergoAbi Abi of Aergo bridge contract
 * @param {string} receiverEthAddr 0x eth address to receive unlocked tokens
 * @return {object} Herajs tx object
 */
export async function buildFreezeTx(
    txSender,
    amount,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverEthAddr, 
    gasLimit=300000,
) {
    checkAergoAddress(txSender);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    const args = [receiverEthAddr.slice(2).toLowerCase(), {_bignum: amount}];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.freeze(...args).asTransaction({
        from: txSender,
        amount: amount.concat(' aer'),
        limit: gasLimit,
    });
    return builtTx;
}

/**
 * Get the unlockable and pending amounts transfering through the bridge
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address of receiver of unlocked tokens
 * @param {string} erc20Addr 0x Address of asset
 * @return {string, string} Amount withdrawable now, amount pending new state root anchor (string with 10^18 decimals)
 */
export function unlockable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverEthAddr, 
    erc20Addr, 
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    checkEthereumAddress(erc20Addr);
    // _unlocks is the 7th var in EthMerkleBridge contract
    const position = Buffer.concat(
        [Buffer.alloc(31), Buffer.from("06", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverEthAddr.slice(2).toLowerCase(), 'hex'), 
        Buffer.from(erc20Addr.slice(2), 'hex')
    ]);
    const ethTrieKey = keccak256(Buffer.concat([accountRef, position]));
    const aergoStorageKey = Buffer.concat(
        [Buffer.from('_sv__burns-', 'utf-8'), accountRef])
    return withdrawable(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, ethTrieKey,
        aergoStorageKey
    );
}

/**
 * Build a burn proof from Aergo 
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} erc20Addr 0x Address of asset
 * @return {Promise} Promise from herajs queryContractStateProof
 */
export async function buildBurnProof(
    web3, 
    hera, 
    bridgeEthAddr, 
    bridgeAergoAddr, 
    receiverEthAddr, 
    erc20Addr, 
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    checkEthereumAddress(erc20Addr);
    const accountRef = Buffer.concat([
        Buffer.from("_sv__burns-", 'utf-8'), 
        Buffer.from(receiverEthAddr.slice(2).toLowerCase(), 'hex'),
        Buffer.from(erc20Addr.slice(2), 'hex')
    ]);
    return buildDepositProof(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, accountRef);
}

/**
 * Build a freeze proof from Aergo 
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contrat
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} aergoErc20Addr 0x Address of aergo erc20
 * @return {Promise} Promise from herajs queryContractStateProof
 */
export async function buildFreezeProof(
    web3, 
    hera, 
    bridgeEthAddr, 
    bridgeAergoAddr, 
    receiverEthAddr, 
    aergoErc20Addr, 
) {
    return buildBurnProof(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, receiverEthAddr,
        aergoErc20Addr, 
    );
}

/**
 * Unlock assets from the Ethereum bridge contract
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {object} bridgeEthAbi Bridge ABI array
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} erc20Addr 0x Address of asset
 * @return {Promise} Promise from web3js send transaction
 */
export async function unlock(
    web3,
    hera, 
    bridgeEthAddr,
    bridgeEthAbi,
    bridgeAergoAddr,
    receiverEthAddr, 
    erc20Addr,
    gasLimit=300000,
) {
    let args = await buildUnlockArgs(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, receiverEthAddr, 
        erc20Addr
    );
    const contract = new web3.eth.Contract(bridgeEthAbi, bridgeEthAddr);
    return contract.methods.unlock(
        receiverEthAddr, args.balance, args.token, args.mp, args.bitmap,
        args.leafHeight
    ).send(
        {from: web3.eth.defaultAccount, gas: gasLimit}
    );
}


/* Aergo -> Ethereum helpers */
/* ========================= */


/**
 * Build arguments for unlocking assets from the Ethereum bridge contract
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} erc20Addr 0x Address of asset
 * @return {Array} Array of arguments usable in mycrypto
 */
export async function buildUnlockArgs(
    web3,
    hera, 
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverEthAddr, 
    erc20Addr
) {
    const proof = await buildBurnProof(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, receiverEthAddr, 
        erc20Addr,
        
    )
    const totalDepositBalance = proof.varProofs[0].value
    const ap = proof.varProofs[0].auditPath.map(function(proofNode) {
        return "0x".concat(
            Buffer.from(proofNode).toString('hex')
        ).padEnd(66, '0')
    })
    const bitmap = "0x".concat(
        Buffer.from(proof.varProofs[0].bitmap).toString('hex')
    ).padEnd(66, '0');
    const leafHeight = proof.varProofs[0].height.toString()
    return {
        receiver: receiverEthAddr, 
        balance: totalDepositBalance, 
        token: erc20Addr, 
        mp: ap, 
        bitmap: bitmap, 
        leafHeight: leafHeight
    }
}


/**
 * Build a deposit proof from Aergo (freeze/burn/lock)
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {Buffer} aergoStorageKey  key storage bytes (before hashing)
 * @return {Promise} Promise from herajs queryContractStateProof
 */
async function buildDepositProof(
    web3, 
    hera, 
    bridgeEthAddr, 
    bridgeAergoAddr, 
    aergoStorageKey
) {
    // check last merged height
    const lastMergedHeightStorage = await web3.eth.getStorageAt(
        bridgeEthAddr, 1, 'latest');
    const lastMergedHeight = new BigNumber(lastMergedHeightStorage);
    const mergeBlockHeader = await hera.getBlockHeaders(
        lastMergedHeight.toNumber(), 1)
    const root = Buffer.from(
        mergeBlockHeader[0].header.blocksroothash, 'base64')

    const aergoBridge = Contract.atAddress(bridgeAergoAddr);
    const query = aergoBridge.queryState(aergoStorageKey, true, root);
    const proof = await hera.queryContractStateProof(query);
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
    const aergoBridge = Contract.atAddress(bridgeAergoAddr);
    // totalDeposit : total latest deposit including pending
    let query = aergoBridge.queryState(aergoStorageKey);
    let storageValue;
    try {
        storageValue = await hera.queryContractState(query);
    } catch (Error) {
        storageValue = 0;
    }
    const totalDeposit = new BigNumber(storageValue)

    // get total withdrawn
    storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, ethTrieKey, 'latest');
    const totalWithdrawn = new BigNumber(storageValue);
    // get last anchor
    storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, 1, 'latest');
    const lastMergedHeight = new BigNumber(storageValue);
    const mergeBlockHeader = await hera.getBlockHeaders(
        lastMergedHeight.toNumber(), 1);
    const root = Buffer.from(
        mergeBlockHeader[0].header.blocksroothash, 'base64');

    // get anchored deposit : total deposit before the last anchor
    query = aergoBridge.queryState(aergoStorageKey, false, root);
    try {
        storageValue = await hera.queryContractState(query);
    } catch (Error) {
        storageValue = 0;
    }
    const anchoredDeposit = new BigNumber(storageValue);

    // calculate withdrawable and pending
    const withdrawableBalance = anchoredDeposit.minus(totalWithdrawn).toString(10);
    const pending = totalDeposit.minus(anchoredDeposit).toString(10);
    return [withdrawableBalance, pending];
}



/**
 * 아르고 상에서 번되고 이더리움 상에서 언락 할 수 있는지 확인
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address of receiver of unlocked tokens
 * @param {string} tokenId locked ARC2 tokenId to unlock ERC721 on ethereum
 * @param {string} erc721Addr 0x Address of asset
 * @return {string, string} Amount withdrawable now, amount pending new state root anchor (string with 10^18 decimals)
 */
 export async function validateERC721Unlockable(
    web3,
    hera,
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverEthAddr,
    tokenId, 
    erc721Addr
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    checkEthereumAddress(erc721Addr);
    // _unlocks is the 11th var in EthMerkleBridge contract
    const position = Buffer.concat(
        [Buffer.alloc(31), Buffer.from("0a", 'hex')]);
    const accountRef = Buffer.concat([
        Buffer.from(receiverEthAddr.slice(2).toLowerCase(), 'hex'),
        Buffer.from(tokenId, 'utf-8'), 
        Buffer.from(erc721Addr.slice(2).toLowerCase(), 'hex')
    ]);
    const ethTrieKey = keccak256(Buffer.concat([accountRef, position]));
    const aergoStorageKey = Buffer.concat(
        [Buffer.from('_sv__burnsARC2-', 'utf-8'), accountRef]);

    const aergoBridge = Contract.atAddress(bridgeAergoAddr);
    // totalDeposit : total latest deposit including pending
    let query = aergoBridge.queryState(aergoStorageKey);

    let storageValue;
    try {
        storageValue = await hera.queryContractState(query);
        
    } catch (err) {
        console.error(err);
        throw Error('Token does not burnt on Aergo, or Check your input is valid');
    }
    const lockBlockNumOnAergo = new BigNumber(storageValue)

    // get ethereum status
    storageValue = await web3.eth.getStorageAt(
        bridgeEthAddr, ethTrieKey, 'latest');

    if(storageValue === undefined) {
        return; // ok
    }

    const unlockedOnEth = new BigNumber(storageValue);

    if(lockBlockNumOnAergo.eq(unlockedOnEth)) {
        throw Error('The Token is Already Minted on Aergo');
    }
}

/**
 * Unlock ERC721 assets from the Ethereum bridge contract
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {object} bridgeEthAbi Bridge ABI array
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} tokenId locked ARC2 tokenId to unlock ERC721 on ethereum
 * @param {string} erc721Addr 0x Address of asset
 * @return {Promise} Promise from web3js send transaction
 */
 export async function unlockERC721(
    web3,
    hera, 
    bridgeEthAddr,
    bridgeEthAbi,
    bridgeAergoAddr,
    receiverEthAddr,
    tokenId,
    erc721Addr,
    gasLimit=300000,
) {
    let args = await buildUnlockERC721Args(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, receiverEthAddr, tokenId, erc721Addr
    );
    const contract = new web3.eth.Contract(bridgeEthAbi, bridgeEthAddr);

    return contract.methods.unlockERC721(
        receiverEthAddr, args.uintTokenId, args.blockNum, erc721Addr, args.mp, args.bitmap, args.leafHeight
    ).send(
        {from: web3.eth.defaultAccount, gas: gasLimit}
    );
}

/**
 * Build arguments for unlocking assets from the Ethereum bridge contract
 * @param {object} web3 Provider (metamask or other web3 compatible)
 * @param {object} hera Herajs client
 * @param {string} bridgeEthAddr 0x Address of bridge contract
 * @param {string} bridgeAergoAddr Aergo address of bridge contract
 * @param {string} receiverEthAddr 0x address to receive unlocked tokens
 * @param {string} tokenId locked ARC2 tokenId to unlock ERC721 on ethereum
 * @param {string} erc721Addr 0x Address of asset
 * @return {Array} Array of arguments usable in mycrypto
 */
 export async function buildUnlockERC721Args(
    web3,
    hera, 
    bridgeEthAddr,
    bridgeAergoAddr,
    receiverEthAddr,
    tokenId,
    erc721Addr
) {
    checkEthereumAddress(bridgeEthAddr);
    checkAergoAddress(bridgeAergoAddr);
    checkEthereumAddress(receiverEthAddr);
    checkEthereumAddress(erc721Addr);
    checkTokenId(tokenId);

    const accountRef = Buffer.concat([
        Buffer.from('_sv__burnsARC2-', 'utf-8'),
        Buffer.from(receiverEthAddr.slice(2).toLowerCase(), 'hex'),
        Buffer.from(tokenId, 'utf-8'), 
        Buffer.from(erc721Addr.slice(2).toLowerCase(), 'hex')
    ]);

    const proof = await buildDepositProof(
        web3, hera, bridgeEthAddr, bridgeAergoAddr, accountRef);

    const burnARC2BlockNum = proof.varProofs[0].value
    const ap = proof.varProofs[0].auditPath.map(function(proofNode) {
        return "0x".concat(
            Buffer.from(proofNode).toString('hex')
        ).padEnd(66, '0')
    });
    const bitmap = "0x".concat(
        Buffer.from(proof.varProofs[0].bitmap).toString('hex')
    ).padEnd(66, '0');
    const leafHeight = proof.varProofs[0].height.toString();

    return {
        uintTokenId: new BigNumber(tokenId),
        blockNum: burnARC2BlockNum, 
        mp: ap, 
        bitmap: bitmap, 
        leafHeight: leafHeight
    }
}