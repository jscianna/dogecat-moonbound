// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title DogecatMoonbound
/// @notice One-per-player achievement NFT for completing the Moon journey in Such Slope.
contract DogecatMoonbound is ERC721, ERC721URIStorage, AccessControl {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  uint256 private _nextTokenId = 1;

  /// @notice playerKey => tokenId (0 = not claimed). Permanent once set.
  mapping(bytes32 => uint256) public tokenIdByPlayerKey;
  /// @notice tokenId => playerKey
  mapping(uint256 => bytes32) public playerKeyOf;

  error ZeroAdmin();
  error ZeroMinter();
  error ZeroRecipient();
  error InvalidPlayerKey();
  error EmptyTokenURI();
  error PlayerAlreadyClaimed(bytes32 playerKey, uint256 tokenId);

  event MoonboundMinted(
    address indexed recipient,
    bytes32 indexed playerKey,
    uint256 indexed tokenId,
    string tokenURI
  );

  // admin: address, Account granted DEFAULT_ADMIN_ROLE (can grant/revoke MINTER_ROLE), 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  // minter: address, Account granted MINTER_ROLE (backend relayer wallet), 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  constructor(address admin, address minter) ERC721("Dogecat Moonbound", "MOON") {
    if (admin == address(0)) revert ZeroAdmin();
    if (minter == address(0)) revert ZeroMinter();
    _setupRole(DEFAULT_ADMIN_ROLE, admin);
    _setupRole(MINTER_ROLE, minter);
  }

  /// @notice Mint the Moonbound NFT for a player. Each playerKey can only ever claim once.
  function mintTo(
    address recipient,
    bytes32 playerKey,
    string calldata uri
  ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
    if (recipient == address(0)) revert ZeroRecipient();
    if (playerKey == bytes32(0)) revert InvalidPlayerKey();
    if (bytes(uri).length == 0) revert EmptyTokenURI();
    uint256 existing = tokenIdByPlayerKey[playerKey];
    if (existing != 0) revert PlayerAlreadyClaimed(playerKey, existing);

    tokenId = _nextTokenId;
    unchecked {
      _nextTokenId = tokenId + 1;
    }
    tokenIdByPlayerKey[playerKey] = tokenId;
    playerKeyOf[tokenId] = playerKey;

    _safeMint(recipient, tokenId);
    _setTokenURI(tokenId, uri);

    emit MoonboundMinted(recipient, playerKey, tokenId, uri);
  }

  /// @notice Whether a playerKey has already claimed its NFT.
  function hasClaimed(bytes32 playerKey) external view returns (bool) {
    return tokenIdByPlayerKey[playerKey] != 0;
  }

  /// @notice Total number of tokens minted.
  function totalMinted() external view returns (uint256) {
    return _nextTokenId - 1;
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
    override(ERC721, ERC721URIStorage, AccessControl)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }

  function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
    super._burn(tokenId);
  }
}
