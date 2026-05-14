// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title MineToken ($MINE)
 * @notice Mint-on-claim ERC-20: total supply starts at 0 and is minted
 *         lazily as miners redeem off-chain proof-of-work IOUs through
 *         a backend-signed claim. Anti-replay nonces are tracked on-chain.
 *
 * Tokenomics (configured off-chain in src/lib/constants.ts):
 *   - MAX_SUPPLY: 100,000,000 MINE (18 decimals)
 *   - Mining bucket: 90% (90,000,000 MINE)
 *   - LP seed:       5%  (5,000,000 MINE)  — owner-minted to a treasury
 *   - Deployer:      5%  (5,000,000 MINE)  — owner-minted with 30-day lock off-chain
 *
 * Flow:
 *   1. User mines via browser PoW → backend accrues IOU.
 *   2. When pending IOU ≥ CLAIM_MIN, user requests a claim from the backend.
 *   3. Backend signs (claimer, amount, nonce, chainId, address(this)) with claimSigner.
 *   4. User calls claim(amount, nonce, signature) with msg.value == minerTipWei.
 *      Contract verifies signature, forwards the tip to tipReceiver, then mints.
 */
contract MineToken is ERC20, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice Hard cap on total supply (cannot be exceeded even by owner mints).
    uint256 public immutable MAX_SUPPLY;

    /// @notice Address whose ECDSA signature authorises a claim(). Backend-only key.
    address public claimSigner;

    /// @notice Anti-replay: each nonce can be used at most once across all claims.
    mapping(bytes32 => bool) public usedNonces;

    /// @notice Convenience accounting: how much each address has minted via claim().
    mapping(address => uint256) public totalClaimed;

    /// @notice Emergency pause for the claim() entrypoint. Owner-controlled.
    bool public claimsPaused;

    /// @notice Required ETH amount (in wei) attached to each claim() call.
    ///         The full amount is forwarded to `tipReceiver`. Owner-settable.
    uint256 public minerTipWei;

    /// @notice Wallet that receives `minerTipWei` on every successful claim().
    address payable public tipReceiver;

    event Claimed(
        address indexed claimer,
        uint256 amount,
        bytes32 indexed nonce,
        uint256 totalClaimedAfter
    );
    event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event ClaimsPausedSet(bool paused);
    event MinerTipUpdated(uint256 oldTipWei, uint256 newTipWei);
    event TipReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event TipForwarded(address indexed receiver, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error ClaimsArePaused();
    error NonceAlreadyUsed(bytes32 nonce);
    error InvalidSignature();
    error MaxSupplyExceeded(uint256 attempted, uint256 cap);
    error InvalidTipAmount(uint256 sent, uint256 required);
    error TipForwardFailed();

    /**
     * @param name_         ERC-20 name, e.g. "BankrMine"
     * @param symbol_       ERC-20 symbol, e.g. "MINE"
     * @param maxSupply_    Hard cap, in whole tokens (contract adds 18 decimals).
     *                     Pass 100_000_000 for 100M MAX_SUPPLY.
     * @param initialOwner  Owner address. Receives admin powers (pause, set signer,
     *                     ownerMint for LP / deployer reserve, transfer ownership).
     * @param claimSigner_  Backend wallet whose signature authorises claim(). May be
     *                     different from owner; rotateable via setClaimSigner().
     * @param minerTipWei_  Initial protocol fee (in wei) required on every claim().
     *                     0 disables the fee entirely; can be changed later via
     *                     setMinerTip(). Forwarded in full to `tipReceiver_`.
     * @param tipReceiver_  Wallet that collects `minerTipWei` on each claim. Must
     *                     accept ETH (EOA or payable contract).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address initialOwner,
        address claimSigner_,
        uint256 minerTipWei_,
        address payable tipReceiver_
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        if (claimSigner_ == address(0)) revert ZeroAddress();
        if (tipReceiver_ == address(0)) revert ZeroAddress();
        if (maxSupply_ == 0) revert ZeroAmount();
        MAX_SUPPLY = maxSupply_ * (10 ** uint256(decimals()));
        claimSigner = claimSigner_;
        minerTipWei = minerTipWei_;
        tipReceiver = tipReceiver_;
        emit ClaimSignerUpdated(address(0), claimSigner_);
        emit MinerTipUpdated(0, minerTipWei_);
        emit TipReceiverUpdated(address(0), tipReceiver_);
    }

    /// @notice Tokens remaining that can still be minted into existence.
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /**
     * @notice Mint via a backend-authorised claim.
     * @dev    The message hash is:
     *           keccak256(abi.encodePacked(claimer, amount, nonce, chainId, address(this)))
     *         wrapped in EIP-191 "\x19Ethereum Signed Message:\n32" prefix.
     *         Backend signs that hash with `claimSigner`'s private key.
     *
     *         Including chainId + address(this) in the digest prevents cross-chain
     *         and cross-contract signature replay. Including nonce prevents
     *         same-chain replay. `msg.value` is NOT part of the signed digest —
     *         the contract enforces the tip amount independently so the owner
     *         can adjust `minerTipWei` without invalidating pending signatures.
     *
     * @param amount     Amount of MINE (with 18 decimals) to mint to msg.sender.
     * @param nonce      Random unique bytes32 issued by the backend per claim.
     * @param signature  65-byte ECDSA signature over the EIP-191 message hash.
     */
    function claim(
        uint256 amount,
        bytes32 nonce,
        bytes calldata signature
    ) external payable {
        if (claimsPaused) revert ClaimsArePaused();
        if (amount == 0) revert ZeroAmount();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);

        uint256 requiredTip = minerTipWei;
        if (msg.value != requiredTip) revert InvalidTipAmount(msg.value, requiredTip);

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                msg.sender,
                amount,
                nonce,
                block.chainid,
                address(this)
            )
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ECDSA.recover(ethSignedHash, signature);
        if (recovered == address(0) || recovered != claimSigner) revert InvalidSignature();

        uint256 newSupply = totalSupply() + amount;
        if (newSupply > MAX_SUPPLY) revert MaxSupplyExceeded(newSupply, MAX_SUPPLY);

        usedNonces[nonce] = true;
        uint256 newTotal = totalClaimed[msg.sender] + amount;
        totalClaimed[msg.sender] = newTotal;

        if (msg.value > 0) {
            (bool ok, ) = tipReceiver.call{value: msg.value}("");
            if (!ok) revert TipForwardFailed();
            emit TipForwarded(tipReceiver, msg.value);
        }

        _mint(msg.sender, amount);
        emit Claimed(msg.sender, amount, nonce, newTotal);
    }

    /**
     * @notice Owner-only mint, used to seed LP and the deployer reserve at launch.
     *         Subject to the same MAX_SUPPLY cap as claim().
     */
    function ownerMint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 newSupply = totalSupply() + amount;
        if (newSupply > MAX_SUPPLY) revert MaxSupplyExceeded(newSupply, MAX_SUPPLY);
        _mint(to, amount);
    }

    /// @notice Rotate the backend claim signer. Owner-only.
    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address old = claimSigner;
        claimSigner = newSigner;
        emit ClaimSignerUpdated(old, newSigner);
    }

    /// @notice Emergency-pause claim() without redeploying. Owner-only.
    function toggleClaimsPaused() external onlyOwner {
        claimsPaused = !claimsPaused;
        emit ClaimsPausedSet(claimsPaused);
    }

    /// @notice Update the protocol fee (in wei) required on each claim(). Owner-only.
    ///         Setting to 0 disables the fee entirely.
    function setMinerTip(uint256 newTipWei) external onlyOwner {
        uint256 old = minerTipWei;
        minerTipWei = newTipWei;
        emit MinerTipUpdated(old, newTipWei);
    }

    /// @notice Update the wallet that receives the protocol fee. Owner-only.
    function setTipReceiver(address payable newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        address old = tipReceiver;
        tipReceiver = newReceiver;
        emit TipReceiverUpdated(old, newReceiver);
    }
}
