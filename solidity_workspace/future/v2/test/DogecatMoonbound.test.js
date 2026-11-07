const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DogecatMoonbound", function () {
  const URI1 = "data:application/json;base64,eyJuYW1lIjoiRG9nZWNhdCBNb29uYm91bmQgIzEifQ==";
  const URI2 = "ipfs://moonbound/2.json";
  const key = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const KEY1 = key("player-001:moonbound");
  const KEY2 = key("player-002:moonbound");
  const KEY3 = key("player-003:moonbound");
  const ADMIN_DELAY = 3600;
  const CAP = 1000n;
  const MISSING_ROLE = /AccessControl: account .* is missing role/;

  async function deployFixture() {
    const [admin, minter, pauser, user1, user2, relayer, stranger, newAdmin] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DogecatMoonbound");
    const nft = await Factory.deploy(admin.address, minter.address, pauser.address, ADMIN_DELAY, CAP);
    await nft.waitForDeployment();
    const MINTER_ROLE = await nft.MINTER_ROLE();
    const PAUSER_ROLE = await nft.PAUSER_ROLE();
    const DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
    return { nft, Factory, admin, minter, pauser, user1, user2, relayer, stranger, newAdmin, MINTER_ROLE, PAUSER_ROLE, DEFAULT_ADMIN_ROLE };
  }

  async function mintedFixture() {
    const ctx = await deployFixture();
    await ctx.nft.connect(ctx.minter).mintTo(ctx.user1.address, KEY1, URI1);
    return ctx;
  }

  describe("deployment", function () {
    it("sets name, symbol, separated roles, owner, delay and cap", async function () {
      const { nft, admin, minter, pauser, MINTER_ROLE, PAUSER_ROLE, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
      expect(await nft.name()).to.equal("Dogecat Moonbound");
      expect(await nft.symbol()).to.equal("MOON");
      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await nft.hasRole(MINTER_ROLE, minter.address)).to.equal(true);
      expect(await nft.hasRole(PAUSER_ROLE, pauser.address)).to.equal(true);
      expect(await nft.hasRole(MINTER_ROLE, admin.address)).to.equal(false);
      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, minter.address)).to.equal(false);
      expect(await nft.owner()).to.equal(admin.address);
      expect(await nft.defaultAdmin()).to.equal(admin.address);
      expect(await nft.defaultAdminDelay()).to.equal(BigInt(ADMIN_DELAY));
      expect(await nft.mintCap()).to.equal(CAP);
      expect(await nft.totalMinted()).to.equal(0n);
      expect(await nft.paused()).to.equal(false);
    });

    it("rejects zero admin, zero minter, zero pauser", async function () {
      const { Factory, admin, minter, pauser } = await loadFixture(deployFixture);
      await expect(Factory.deploy(ethers.ZeroAddress, minter.address, pauser.address, ADMIN_DELAY, CAP)).to.be.reverted;
      await expect(Factory.deploy(admin.address, ethers.ZeroAddress, pauser.address, ADMIN_DELAY, CAP))
        .to.be.revertedWithCustomError(Factory, "ZeroMinter");
      await expect(Factory.deploy(admin.address, minter.address, ethers.ZeroAddress, ADMIN_DELAY, CAP))
        .to.be.revertedWithCustomError(Factory, "ZeroPauser");
    });

    it("rejects admin == minter at deployment", async function () {
      const { Factory, admin, pauser } = await loadFixture(deployFixture);
      await expect(Factory.deploy(admin.address, admin.address, pauser.address, ADMIN_DELAY, CAP))
        .to.be.revertedWithCustomError(Factory, "RoleSeparation")
        .withArgs(admin.address);
    });
  });

  describe("minting", function () {
    it("minter mints successfully with event, owner, URI, mappings", async function () {
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
    });

    it("token IDs increment and totalMinted is correct", async function () {
      const { nft, minter, user2 } = await loadFixture(mintedFixture);
      await expect(nft.connect(minter).mintTo(user2.address, KEY2, URI2))
        .to.emit(nft, "MoonboundMinted")
        .withArgs(user2.address, KEY2, 2n, URI2);
      expect(await nft.tokenURI(2)).to.equal(URI2);
      expect(await nft.totalMinted()).to.equal(2n);
    });

    it("rejects mint from stranger, admin and pauser", async function () {
      const { nft, stranger, admin, pauser } = await loadFixture(deployFixture);
      await expect(nft.connect(stranger).mintTo(stranger.address, KEY1, URI1)).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(admin).mintTo(admin.address, KEY1, URI1)).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(pauser).mintTo(pauser.address, KEY1, URI1)).to.be.revertedWith(MISSING_ROLE);
    });

    it("rejects duplicate playerKey (same wallet)", async function () {
      const { nft, minter, user1 } = await loadFixture(mintedFixture);
      await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI2))
        .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
        .withArgs(KEY1, 1n);
    });

    it("rejects duplicate playerKey with a different recipient wallet", async function () {
      const { nft, minter, user2 } = await loadFixture(mintedFixture);
      await expect(nft.connect(minter).mintTo(user2.address, KEY1, URI1))
        .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
        .withArgs(KEY1, 1n);
    });

    it("rejects duplicate playerKey after the NFT was transferred away", async function () {
      const { nft, minter, user1, user2 } = await loadFixture(mintedFixture);
      await nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1);
      await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI1))
        .to.be.revertedWithCustomError(nft, "PlayerAlreadyClaimed")
        .withArgs(KEY1, 1n);
    });

    it("rejects zero recipient, zero playerKey and empty URI", async function () {
      const { nft, minter, user1 } = await loadFixture(deployFixture);
      await expect(nft.connect(minter).mintTo(ethers.ZeroAddress, KEY1, URI1)).to.be.revertedWithCustomError(nft, "ZeroRecipient");
      await expect(nft.connect(minter).mintTo(user1.address, ethers.ZeroHash, URI1)).to.be.revertedWithCustomError(nft, "InvalidPlayerKey");
      await expect(nft.connect(minter).mintTo(user1.address, KEY1, "")).to.be.revertedWithCustomError(nft, "EmptyTokenURI");
      expect(await nft.totalMinted()).to.equal(0n);
    });

    it("tokens are transferable and keep their URI", async function () {
      const { nft, user1, user2 } = await loadFixture(mintedFixture);
      await expect(nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1))
        .to.emit(nft, "Transfer")
        .withArgs(user1.address, user2.address, 1n);
      expect(await nft.ownerOf(1)).to.equal(user2.address);
      expect(await nft.tokenURI(1)).to.equal(URI1);
    });
  });

  describe("minter role management", function () {
    it("admin grants and revokes MINTER_ROLE for a replacement relayer", async function () {
      const { nft, admin, relayer, user1, user2, MINTER_ROLE } = await loadFixture(deployFixture);
      await expect(nft.connect(admin).grantRole(MINTER_ROLE, relayer.address))
        .to.emit(nft, "RoleGranted")
        .withArgs(MINTER_ROLE, relayer.address, admin.address);
      await nft.connect(relayer).mintTo(user1.address, KEY1, URI1);

      await expect(nft.connect(admin).revokeRole(MINTER_ROLE, relayer.address))
        .to.emit(nft, "RoleRevoked")
        .withArgs(MINTER_ROLE, relayer.address, admin.address);
      await expect(nft.connect(relayer).mintTo(user2.address, KEY2, URI2)).to.be.revertedWith(MISSING_ROLE);
    });

    it("minter can renounce its own role", async function () {
      const { nft, minter, user1, MINTER_ROLE } = await loadFixture(deployFixture);
      await nft.connect(minter).renounceRole(MINTER_ROLE, minter.address);
      await expect(nft.connect(minter).mintTo(user1.address, KEY1, URI1)).to.be.revertedWith(MISSING_ROLE);
    });

    it("compromised minter cannot grant roles, change cap, pause or unpause", async function () {
      const { nft, minter, stranger, MINTER_ROLE } = await loadFixture(deployFixture);
      await expect(nft.connect(minter).grantRole(MINTER_ROLE, stranger.address)).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(minter).setMintCap(10n ** 9n)).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(minter).pause()).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(minter).unpause()).to.be.revertedWith(MISSING_ROLE);
      await expect(nft.connect(minter).beginDefaultAdminTransfer(minter.address)).to.be.revertedWith(MISSING_ROLE);
    });
  });

  describe("admin / minter separation", function () {
    it("admin cannot grant MINTER_ROLE to itself", async function () {
      const { nft, admin, MINTER_ROLE } = await loadFixture(deployFixture);
      await expect(nft.connect(admin).grantRole(MINTER_ROLE, admin.address))
        .to.be.revertedWithCustomError(nft, "RoleSeparation")
        .withArgs(admin.address);
    });

    it("DEFAULT_ADMIN_ROLE cannot be granted directly", async function () {
      const { nft, admin, newAdmin, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
      await expect(nft.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.reverted;
    });

    it("admin transfer is two-step and delayed", async function () {
      const { nft, admin, newAdmin, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
      await nft.connect(admin).beginDefaultAdminTransfer(newAdmin.address);
      await expect(nft.connect(newAdmin).acceptDefaultAdminTransfer()).to.be.reverted;
      await time.increase(ADMIN_DELAY + 1);
      await nft.connect(newAdmin).acceptDefaultAdminTransfer();
      expect(await nft.owner()).to.equal(newAdmin.address);
      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(false);
    });

    it("admin role cannot be transferred to the minter", async function () {
      const { nft, admin, minter } = await loadFixture(deployFixture);
      await nft.connect(admin).beginDefaultAdminTransfer(minter.address);
      await time.increase(ADMIN_DELAY + 1);
      await expect(nft.connect(minter).acceptDefaultAdminTransfer())
        .to.be.revertedWithCustomError(nft, "RoleSeparation")
        .withArgs(minter.address);
    });
  });

  describe("damage limits", function () {
    it("enforces mintCap; only admin can change it, never below minted", async function () {
      const { nft, admin, minter, stranger, user1, user2 } = await loadFixture(mintedFixture);
      await expect(nft.connect(admin).setMintCap(0n))
        .to.be.revertedWithCustomError(nft, "MintCapBelowMinted")
        .withArgs(0n, 1n);
      await expect(nft.connect(admin).setMintCap(1n)).to.emit(nft, "MintCapUpdated").withArgs(CAP, 1n);
      await expect(nft.connect(minter).mintTo(user2.address, KEY2, URI2))
        .to.be.revertedWithCustomError(nft, "MintCapReached")
        .withArgs(1n);
      expect(await nft.hasClaimed(KEY2)).to.equal(false);

      await expect(nft.connect(stranger).setMintCap(5n)).to.be.revertedWith(MISSING_ROLE);
      await nft.connect(admin).setMintCap(2n);
      await nft.connect(minter).mintTo(user2.address, KEY2, URI2);
      await expect(nft.connect(minter).mintTo(user1.address, KEY3, URI2))
        .to.be.revertedWithCustomError(nft, "MintCapReached")
        .withArgs(2n);
    });

    it("pauser halts minting, transfers still work, only admin unpauses", async function () {
      const { nft, admin, minter, pauser, user1, user2 } = await loadFixture(mintedFixture);
      await nft.connect(pauser).pause();
      await expect(nft.connect(minter).mintTo(user2.address, KEY2, URI2)).to.be.revertedWith("Pausable: paused");

      await nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1);
      expect(await nft.ownerOf(1)).to.equal(user2.address);

      await expect(nft.connect(pauser).unpause()).to.be.revertedWith(MISSING_ROLE);
      await nft.connect(admin).unpause();
      await nft.connect(minter).mintTo(user2.address, KEY2, URI2);
      expect(await nft.totalMinted()).to.equal(2n);
    });
  });
});
