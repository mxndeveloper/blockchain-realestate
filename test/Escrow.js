const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

describe('Escrow', () => {
    let buyer, seller, inspector, lender;
    let realEstate, escrow;

    beforeEach(async () => {
        [buyer, seller, inspector, lender] = await ethers.getSigners();

        const RealEstate = await ethers.getContractFactory('RealEstate');
        realEstate = await RealEstate.deploy();

        let transaction = await realEstate.connect(seller).mint("https://ipfs.io/ipfs/QmTudSYeM7mz3PkYEWXWqPjomRPHogcMFSq7XAvsvsgAPS");
        await transaction.wait();

        const Escrow = await ethers.getContractFactory('Escrow');
        escrow = await Escrow.deploy(
            realEstate.address,
            seller.address,
            inspector.address,
            lender.address
        );

        transaction = await realEstate.connect(seller).approve(escrow.address, 1);
        await transaction.wait();

        transaction = await escrow.connect(seller).list(1, buyer.address, tokens(10), tokens(5));
        await transaction.wait();
    });

    describe('Deployment', () => {
        it('Returns NFT address', async () => {
            const result = await escrow.nftAddress();
            expect(result).to.be.equal(realEstate.address);
        });

        it('Returns seller address', async () => {
            const result = await escrow.seller();
            expect(result).to.be.equal(seller.address);
        });

        it('Returns inspector address', async () => {
            const result = await escrow.inspector();
            expect(result).to.be.equal(inspector.address);
        });

        it('Returns lender address', async () => {
            const result = await escrow.lender();
            expect(result).to.be.equal(lender.address);
        });
    });

    describe('Listing', () => {
        it('Updates as listed', async () => {
            const result = await escrow.isListed(1);
            expect(result).to.be.equal(true);
        });

        it('Updates ownership', async () => {
            expect(await realEstate.ownerOf(1)).to.be.equal(escrow.address);
        });

        it('Returns buyer', async () => {
            const result = await escrow.buyer(1);
            expect(result).to.be.equal(buyer.address);
        });

        it('Returns purchase price', async () => {
            const result = await escrow.purchasePrice(1);
            expect(result).to.be.equal(tokens(10));
        });

        it('Returns escrow amount', async () => {
            const result = await escrow.escrowAmount(1);
            expect(result).to.be.equal(tokens(5));
        });
    });

    describe('Deposits', () => {
        it('Updates contract balance', async () => {
            const transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
            await transaction.wait();
            const result = await escrow.getBalance();
            expect(result).to.be.equal(tokens(5));
        });
    });

    describe('Inspection', () => {
        it('Updates inspection status', async () => {
            const transaction = await escrow.connect(inspector).updateInspectionStatus(1, true);
            await transaction.wait();
            const result = await escrow.inspectionPassed(1);
            expect(result).to.be.equal(true);
        });
    });

    describe('Approval', () => {
        it('Updates approval status', async () => {
            let transaction

            transaction = await escrow.connect(buyer).approveSale(1);
            await transaction.wait();

            transaction = await escrow.connect(seller).approveSale(1);
            await transaction.wait();

            transaction = await escrow.connect(lender).approveSale(1);
            await transaction.wait();

            expect(await escrow.approval(1, buyer.address)).to.be.equal(true);
            expect(await escrow.approval(1, seller.address)).to.be.equal(true);
            expect(await escrow.approval(1, lender.address)).to.be.equal(true);
            
        });
    });



    describe('Sale Finalization', () => {
        beforeEach(async () => {
            // Buyer deposits earnest
            let transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
            await transaction.wait();

            // Inspector approves
            transaction = await escrow.connect(inspector).updateInspectionStatus(1, true);
            await transaction.wait();

            // Buyer deposits remaining amount
            transaction = await buyer.sendTransaction({
                to: escrow.address,
                value: tokens(5)
            });
            await transaction.wait();

            // Get all required approvals
            transaction = await escrow.connect(buyer).approveSale(1);
            await transaction.wait();
            
            transaction = await escrow.connect(seller).approveSale(1);
            await transaction.wait();
            
            transaction = await escrow.connect(lender).approveSale(1);
            await transaction.wait();
        });

        it('Finalizes sale', async () => {
            const balanceBefore = await ethers.provider.getBalance(seller.address);
            const transaction = await escrow.connect(buyer).finalizeSale(1);
            await transaction.wait();

            // Check NFT ownership
            expect(await realEstate.ownerOf(1)).to.be.equal(buyer.address);

            // Check seller received funds
            const balanceAfter = await ethers.provider.getBalance(seller.address);
            expect(balanceAfter.sub(balanceBefore)).to.be.equal(tokens(10));
        });
    });

    describe('Cancellation', () => {
        it('Allows seller to cancel', async () => {
            const transaction = await escrow.connect(seller).cancel(1);
            await transaction.wait();

            expect(await realEstate.ownerOf(1)).to.be.equal(seller.address);
        });

        it('Allows buyer to cancel', async () => {
            const transaction = await escrow.connect(buyer).cancel(1);
            await transaction.wait();

            expect(await realEstate.ownerOf(1)).to.be.equal(seller.address);
        });

        it('Allows inspector to cancel', async () => {
            const transaction = await escrow.connect(inspector).cancel(1);
            await transaction.wait();

            expect(await realEstate.ownerOf(1)).to.be.equal(seller.address);
        });
    });
});