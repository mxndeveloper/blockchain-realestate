const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

describe('Escrow', () => {
    let  buyer, seller, inspector, lender
    let realEstate, escrow

    beforeEach( async () => {
        // Set up accounts
        [buyer, seller, inspector, lender] = await ethers.getSigners()

        // Deploy Real Estate
        const RealEstate = await ethers.getContractFactory('RealEstate')
        realEstate = await RealEstate.deploy()

        // Mint
        let transaction = await realEstate.connect(seller).mint("https://ipfs.io/ipfs/QmTudSYeM7mz3PkYEWXWqPjomRPHogcMFSq7XAvsvsgAPS")
        await transaction.wait()

        // Deploy Escrow
        const Escrow = await ethers.getContractFactory('Escrow')
        escrow = await Escrow.deploy(
            realEstate.address,
            seller.address,
            inspector.address,
            lender.address
        )

        // Approve property
        transaction = await realEstate.connect(seller).approve(escrow.address, 1);
        await transaction.wait()

        // List property
        transaction = await escrow.connect(seller).list(1, buyer.address, tokens(10), tokens(5));
        await transaction.wait()
    })

    describe('Deployment', async () => {

        it('Return NFT address', async () => {
        const result = await escrow.nftAddress()
        expect(result).to.be.equal(realEstate.address);
    })

        it('Return seller address', async () => {
            const result = await escrow.seller()
            expect(result).to.be.equal(seller.address);
        })

        it('Return inspector address', async () => {
            const result = await escrow.inspector()
            expect(result).to.be.equal(inspector.address);
        })

        it('Return lender address', async () => {
            const result = await escrow.lender()
            expect(result).to.be.equal(lender.address);
        })
    })
    

    describe('Listing', async () => {

        it('Updates as listed', async () => {
            const result = await escrow.isListed(1);
            expect(result).to.be.equal(true);
        })

        it('Updates ownership', async () => {
            expect(await realEstate.ownerOf(1)).to.be.equal(escrow.address)
        })

        it('Returns buyer', async () => {
            const result = await escrow.buyer(1)
            expect(result).to.be.equal(buyer.address)

        })

        it('Returns Purchase Price', async () => {
            const result = await escrow.purchasePrice(1)
            expect(result).to.be.equal(tokens(10))

        })

        it('Returns escrow amount', async () => {
            const result = await escrow.escrowAmount(1)
            expect(result).to.be.equal(tokens(5))

        })

    })

    describe('Access control: Only seller', async () => {
        let nftID = 2; // Using a different ID than the one in beforeEach

        before(async () => {
            // Mind a new NFT for testing (separate from beforeEach setup)
            let transaction = await RealEstate.connect(seller).mint("https://ipfs.io/ipfs/QmTudSYeM7mz3PkYEWXWqPjomRPHogcMFSq7XAvsvsgAPS");
            await transaction.wait()

            // Approve the new NFT
            
        })

        it('Should allow seller to call list()', async () => {
            // Seller successfully list a new property
            await expect(
                escrow.connect(seller).list(
                    2,              // New NFT ID
                    buyer.address,
                    tokens(15),     // New Price
                    tokens(7)       // New escrow
                )
            ).not.to.be.reverted
        });

        it('Should prevent non-seller from calling list()', async () => {
            // Attempt to list from buyer account
            await expect(
                escrow.connect(buyer).list(
                    2,
                    buyer.address,
                    seller.address,
                    tokens(15),
                    tokens(7)
                )
            ).to.be.revertedWith("Only seller can call this method");

            // Attempt to list from lender account
            await expect (
                escrow.connect(lender).list(
                    2,
                    buyer.address,
                    tokens(15),
                    escrow(7)
                )
            ).to.be.revertedWith("Only seller can call this method");

        })
    })
})