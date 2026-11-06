// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControlDefaultAdminRules.sol";

/// @title DogecatMoonbound
/// @notice One-per-player achievement NFT for completing the Moon journey in Such Slope.
/// @dev Security model:
///  - DEFAULT_ADMIN_ROLE: single cold/hardware address (collection provenance, `owner()`).
///    Transfers are two-step with an onchain delay (AccessControlDefaultAdminRules).
///  - MINTER_ROLE: replaceable hot relayer wallet. Can ONLY call `mintTo`.
///  - PAUSER_ROLE: can halt minting quickly; only the admin can unpause.
///  - An account can never hold both DEFAULT_ADMIN_ROLE and MINTER_ROLE.
///  - `mintCap` bounds the total number of tokens a compromised minter could create.
contract DogecatMoonbound is ERC721, ERC721URIStorage, Pausable, AccessControlDefaultAdminRules {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

  uint256 private _nextTokenId = 1;

  /// @notice Maximum total tokens that may exist. Admin-adjustable, never below totalMinted.
  uint256 public mintCap;

  /// @notice playerKey => tokenId (0 = not claimed). Permanent once set.
  mapping(bytes32 => uint256) public tokenIdByPlayerKey;
  /// @notice tokenId => playerKey
  mapping(uint256 => bytes32) public playerKeyOf;

  error ZeroMinter();
  error ZeroPauser();
  error ZeroRecipient();
  error InvalidPlayerKey();
  error EmptyTokenURI();
  error PlayerAlreadyClaimed(bytes32 playerKey, uint256 tokenId);
  error MintCapReached(uint256 cap);
  error MintCapBelowMinted(uint256 newCap, uint256 minted);
  error RoleSeparation(address account);

  event MoonboundMinted(
    address indexed recipient,
    bytes32 indexed playerKey,
    uint256 indexed tokenId,
    string tokenURI
  );
  event MintCapUpdated(uint256 previousCap, uint256 newCap);

  // admin: address, Cold/hardware wallet granted DEFAULT_ADMIN_ROLE (collection owner), 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  // minter: address, Hot relayer wallet granted MINTER_ROLE (must differ from admin), 0x8ba1f109551bD432803012645Ac136ddd64DBA72
  // pauser: address, Account granted PAUSER_ROLE (may equal admin, must not equal minter), 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  // adminTransferDelay: uint48, Seconds a pending admin transfer must wait, 86400 = 1 day
  // initialMintCap: uint256, Maximum tokens mintable until admin raises it, 1000 = 1000 NFTs
  constructor(
    address admin,
    address minter,
    address pauser,
    uint48 adminTransferDelay,
    uint256 initialMintCap
  )
    ERC721("Dogecat Moonbound", "MOON")
    AccessControlDefaultAdminRules(adminTransferDelay, admin)
  {
    if (minter == address(0)) revert ZeroMinter();
    if (pauser == address(0)) revert ZeroPauser();
    _grantRole(MINTER_ROLE, minter); // reverts RoleSeparation if minter == admin
    _grantRole(PAUSER_ROLE, pauser);
    mintCap = initialMintCap;
    emit MintCapUpdated(0, initialMintCap);
  }

  /// @notice Mint the Moonbound NFT for a player. Each playerKey can only ever claim once.
  function mintTo(
    address recipient,
    bytes32 playerKey,
    string calldata uri
  ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256 tokenId) {
    if (recipient == address(0)) revert ZeroRecipient();
    if (playerKey == bytes32(0)) revert InvalidPlayerKey();
    if (bytes(uri).length == 0) revert EmptyTokenURI();
    uint256 existing = tokenIdByPlayerKey[playerKey];
    if (existing != 0) revert PlayerAlreadyClaimed(playerKey, existing);

    tokenId = _nextTokenId;
    if (tokenId > mintCap) revert MintCapReached(mintCap);
    unchecked {
      _nextTokenId = tokenId + 1;
    }
    tokenIdByPlayerKey[playerKey] = tokenId;
    playerKeyOf[tokenId] = playerKey;

    _safeMint(recipient, tokenId);
    _setTokenURI(tokenId, uri);

    emit MoonboundMinted(recipient, playerKey, tokenId, uri);
  }

  /// @notice Admin adjusts the total mint cap (e.g. raise in batches as players claim).
  function setMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 minted = _nextTokenId - 1;
    if (newCap < minted) revert MintCapBelowMinted(newCap, minted);
    emit MintCapUpdated(mintCap, newCap);
    mintCap = newCap;
  }

  /// @notice Halt minting (transfers are unaffected).
  function pause() external onlyRole(PAUSER_ROLE) {
    _pause();
  }

  /// @notice Resume minting. Admin only, so a compromised pauser cannot toggle it back.
  function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
  }

  /// @notice Whether a playerKey has already claimed its NFT.
  function hasClaimed(bytes32 playerKey) external view returns (bool) {
    return tokenIdByPlayerKey[playerKey] != 0;
  }

  /// @notice Total number of tokens minted.
  function totalMinted() external view returns (uint256) {
    return _nextTokenId - 1;
  }

  /// @dev Enforce that no account ever holds both DEFAULT_ADMIN_ROLE and MINTER_ROLE.
  function _grantRole(bytes32 role, address account) internal override {
    if (role == MINTER_ROLE && hasRole(DEFAULT_ADMIN_ROLE, account)) revert RoleSeparation(account);
    if (role == DEFAULT_ADMIN_ROLE && hasRole(MINTER_ROLE, account)) revert RoleSeparation(account);
    super._grantRole(role, account);
  }

  function tokenURI(uint256 tokenId)
    public
    view
    override(ERC721, ERC721URIStorage)
    returns (string memory)
  {
    return super.tokenURI(tokenId);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC721URIStorage, AccessControlDefaultAdminRules)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }

  function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
    super._burn(tokenId);
  }
}
