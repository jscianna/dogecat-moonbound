const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const artifact = require("../artifacts/contracts/DogecatMoonbound.sol/DogecatMoonbound.json");
const abi = require("../deployments/DogecatMoonbound.abi.json");
const record = require("../deployments/dogeos-testnet.json");
if (network.name !== "hardhat") throw new Error("Isolated Hardhat tests only; never a public network.");

describe("Pinned V1 integration", () => {
  it("keeps the deployment ABI and runtime bytecode intact", () => {
    expect(abi).to.deep.equal(artifact.abi);
    expect(ethers.keccak256(artifact.deployedBytecode)).to.equal(record.verification.runtimeBytecodeKeccak256);
    expect(abi.find(item => item.type === "constructor").inputs.length).to.equal(2);
    for (const name of ["owner", "pause", "mintCap", "defaultAdmin"]) expect(abi.some(item=>item.name===name)).to.equal(false);
  });
  it("the relayer pays gas, exact metadata reaches the recipient, concurrent duplicate claims fail", async () => {
    const [admin, minter, player] = await ethers.getSigners();
    const nft = await new ethers.ContractFactory(abi, artifact.bytecode, admin).deploy(admin.address,minter.address);
    await nft.waitForDeployment();
    const key=ethers.keccak256(ethers.toUtf8Bytes("12345678-1234-1234-1234-123456789abc:moonbound"));
    const metadata={name:"Dogecat Moonbound #1",description:"Awarded for completing the Moon journey in Such Slope.",image:"https://turbo-gateway.com/raw/jIy4eX4rONnpGxDuEwLjFr1eAzfpsSYpkGAKG3fLgo8",external_url:"https://dogecat.com/player#moonbound",attributes:[{trait_type:"Game",value:"Such Slope"},{trait_type:"Achievement",value:"Moonbound"},{trait_type:"Series",value:"Lunar Archive"},{trait_type:"Network",value:"DogeOS Chikyū Testnet"}]};
    const uri="data:application/json;base64,"+Buffer.from(JSON.stringify(metadata)).toString("base64");
    const beforeMinter=await ethers.provider.getBalance(minter.address),beforePlayer=await ethers.provider.getBalance(player.address);
    const results=await Promise.allSettled([nft.connect(minter).mintTo(player.address,key,uri),nft.connect(minter).mintTo(player.address,key,uri)]);
    const success=results.filter(result=>result.status==="fulfilled");expect(success.length).to.equal(1);
    const receipt=await success[0].value.wait();
    expect(receipt.from).to.equal(minter.address);
    expect(await ethers.provider.getBalance(minter.address)).to.be.lessThan(beforeMinter);
    expect(await ethers.provider.getBalance(player.address)).to.equal(beforePlayer);
    expect(await nft.ownerOf(1)).to.equal(player.address);expect(await nft.tokenIdByPlayerKey(key)).to.equal(1n);
    expect(await nft.totalMinted()).to.equal(1n);expect(await nft.tokenURI(1)).to.equal(uri);
    expect(JSON.parse(Buffer.from((await nft.tokenURI(1)).split(",")[1],"base64").toString())).to.deep.equal(metadata);
    expect(receipt.gasUsed * 120n / 100n).to.be.lessThan(1000000n);
  });
});
