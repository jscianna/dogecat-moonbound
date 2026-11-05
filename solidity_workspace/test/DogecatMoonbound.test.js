const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DogecatMoonbound", function () {
  const URI1 = "data:application/json;base64,eyJuYW1lIjoiRG9nZWNhdCBNb29uYm91bmQgIzEifQ==";
  const URI2 = "ipfs://moonbound/2.json";
  const key = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const KEY1 = key("player-001:moonbound");
  const KEY2 = key("player-002:moonbound");

  async function deployFixture() {
    const [admin, minter, user1, user2, relayer, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DogecatMoonbound");
    const nft = await Factory.deploy(admin.address, minter.address);
    await nft.waitForDeployment();
    const MINTER_ROLE = await nft.MINTER_ROLE();
    const DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
    return { nft, Factory, admin, minter, user1, user2, relayer, stranger, MINTER_ROLE, DEFAULT_ADMIN_ROLE };
  }

  async function mintedFixture() {
    const ctx = await deployFixture();
    await ctx.nft.connect(ctx.minter).mintTo(ctx.user1.address, KEY1, URI1);
    return ctx;
  }

  it("1. deploys with correct name/symbol, admin and minter roles", async function () {
    const { nft, admin, minter, MINTER_ROLE, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
    expect(await nft.name()).to.equal("Dogecat Moonbound");
    expect(await nft.symbol()).to.equal("MOON");
    expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await nft.hasRole(MINTER_ROLE, minter.address)).to.equal(true);
    expect(await nft.hasRole(MINTER_ROLE, admin.address)).to.equal(false);
    expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, minter.address)).to.equal(false);
    expect(MINTER_ROLE).to.equal(key("MINTER_ROLE"));
    expect(await nft.totalMinted()).to.equal(0n);
  });

  it("2. constructor reverts with zero admin or zero minter", async function () {
    const { Factory, admin, minter } = await loadFixture(deployFixture);
    await expect(Factory.deploy(ethers.ZeroAddress, minter.address)).to.be.revertedWithCustomError(Factory, "ZeroAdmin");
    await expect(Factory.deploy(admin.address, ethers.ZeroAddress)).to.be.revertedWithCustomError(Factory, "ZeroMinter");
  });

  it("3. minter mints successfully with event, owner, URI, mappings", async function () {
    const { nft, minter, user1 } = await loadFixture(deployFixture);
    await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI1))
      .to.emit(nft, "MoonboundMinted")
      .withArgs(user1.address, KEY1, 1n, URI1);
    expect(await nft.ownerOf(1)).to.equal(user1.address);
    expect(await nft.tokenURI(1)).to.equal(URI1);
    expect(await nft.tokenIdByPlayerKey(KEY1)).to.equal(1n);
    expect(await nft.playerKeyOf(1)).to.equal(KEY1);
    expect(await nft.hasClaimed(KEY1)).to.equal(true);
    expect(await nft.hasClaimed(KEY2)).to.equal(false);
    expect(await nft.balanceOf(user1.address)).to.equal(1n);
  });

  it("4. token IDs increment and totalMinted is correct", async function () {
    const { nft, minter, user2 } = await loadFixture(mintedFixture);
    expect(await nft.totalMinted()).to.equal(1n);
    await expect(nft.connect(minter).mintTo(user2.address, KEY2, URI2))
      .to.emit(nft, "MoonboundMinted")
      .withArgs(user2.address, KEY2, 2n, URI2);
    expect(await nft.ownerOf(2)).to.equal(user2.address);
    expect(await nft.tokenURI(2)).to.equal(URI2);
    expect(await nft.totalMinted()).to.equal(2n);
  });

  it("5. unauthorized account mint reverts", async function () {
    const { nft, stranger, admin } = await loadFixture(deployFixture);
    await expect(nft.connect(stranger).mintTo(stranger.address, KEY1, URI1)).to.be.revertedWith(
      /AccessControl: account .* is missing role/
    );
    await expect(nft.connect(admin).mintTo(admin.address, KEY1, URI1)).to.be.reverted;
  });

  it("6. duplicate playerKey reverts with PlayerAlreadyClaimed (same wallet)", async function () {
    const { nft, minter, user1 } = await loadFixture(mintedFixture);
    await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI2))
      .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
      .withArgs(KEY1, 1n);
  });

  it("7. duplicate playerKey reverts with a different recipient wallet", async function () {
    const { nft, minter, user2 } = await loadFixture(mintedFixture);
    await expect(nft.connect(minter).mintTo(user2.address, KEY1, URI1))
      .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
      .withArgs(KEY1, 1n);
  });

  it("8. duplicate playerKey still reverts after NFT transferred away", async function () {
    const { nft, minter, user1, user2 } = await loadFixture(mintedFixture);
    await nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1);
    expect(await nft.ownerOf(1)).to.equal(user2.address);
    await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI1))
      .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
      .withArgs(KEY1, 1n);
    expect(await nft.hasClaimed(KEY1)).to.equal(true);
  });

  it("9. zero recipient reverts ZeroRecipient", async function () {
    const { nft, minter } = await loadFixture(deployFixture);
    await expect(nft.connect(minter).mintTo(ethers.ZeroAddress, KEY1, URI1)).to.be.revertedWithCustomError(
      nft,
      "ZeroRecipient"
    );
  });

  it("10. zero playerKey reverts InvalidPlayerKey; empty URI reverts EmptyTokenURI", async function () {
    const { nft, minter, user1 } = await loadFixture(deployFixture);
    await expect(nft.connect(minter).mintTo(user1.address, ethers.ZeroHash, URI1)).to.be.revertedWithCustomError(
      nft,
      "InvalidPlayerKey"
    );
    await expect(nft.connect(minter).mintTo(user1.address, KEY1, "")).to.be.revertedWithCustomError(
      nft,
      "EmptyTokenURI"
    );
    expect(await nft.totalMinted()).to.equal(0n);
  });

  it("11. admin can grant and revoke MINTER_ROLE for a relayer", async function () {
    const { nft, admin, relayer, user1, user2, MINTER_ROLE } = await loadFixture(deployFixture);
    await expect(nft.connect(admin).grantRole(MINTER_ROLE, relayer.address))
      .to.emit(nft, "RoleGranted")
      .withArgs(MINTER_ROLE, relayer.address, admin.address);
    await nft.connect(relayer).mintTo(user1.address, KEY1, URI1);
    expect(await nft.ownerOf(1)).to.equal(user1.address);

    await expect(nft.connect(admin).revokeRole(MINTER_ROLE, relayer.address))
      .to.emit(nft, "RoleRevoked")
      .withArgs(MINTER_ROLE, relayer.address, admin.address);
    expect(await nft.hasRole(MINTER_ROLE, relayer.address)).to.equal(false);
    await expect(nft.connect(relayer).mintTo(user2.address, KEY2, URI2)).to.be.revertedWith(
      /AccessControl: account .* is missing role/
    );
  });

  it("12. tokens are transferable via safeTransferFrom", async function () {
    const { nft, user1, user2 } = await loadFixture(mintedFixture);
    await expect(nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1))
      .to.emit(nft, "Transfer")
      .withArgs(user1.address, user2.address, 1n);
    expect(await nft.ownerOf(1)).to.equal(user2.address);
    expect(await nft.balanceOf(user1.address)).to.equal(0n);
    expect(await nft.balanceOf(user2.address)).to.equal(1n);
    expect(await nft.tokenURI(1)).to.equal(URI1);
  });
});
