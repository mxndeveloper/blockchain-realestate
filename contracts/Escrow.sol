//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// ===== INTERFACES =====
interface IERC721 {
    function transferFrom(
        address _from,
        address _to,
        uint256 _id
    ) external;
}

// ===== CONTRACT =====
contract Escrow {
    // ===== EVENTS =====
    event Listed(uint256 indexed _nftID, address indexed _buyer, uint256 _purchasePrice);
    event DepositMade(uint256 indexed _nftID, address indexed _seller, uint256 _escrowAmount);
    event InspectionPassed(uint256 indexed _nftID, bool _passed);
    event SaleFinalized(uint256 indexed _nftID, address indexed _buyer, uint256 _amount);
    event Cancelled(uint256 indexed _nftID);

    // ===== STATE VARIABLES =====
    address public immutable nftAddress;
    address payable public seller;
    address public immutable inspector;
    address public immutable lender;

    // ===== MAPPINGS =====
    mapping(uint256 => bool) public isListed;
    mapping(uint256 => uint256) public purchasePrice;
    mapping(uint256 => uint256) public escrowAmount;
    mapping(uint256 => address) public buyer;
    mapping(uint256 => bool) public inspectionPassed;
    mapping(uint256 => mapping(address => bool)) public approval;
    mapping(uint256 => bool) public saleFinalized;

    bool private locked;

    // ===== MODIFIERS =====
    modifier onlyBuyer(uint256 _nftID) {
        require(msg.sender == buyer[_nftID], "Only buyer can call this method");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "Only seller can call this method");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "No reentrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyInspector() {
        require(msg.sender == inspector, "Only inspector can call this method");
        _;
    }

    modifier onlyListed(uint256 _nftID) {
        require(isListed[_nftID], "NFT not listed");
        _;
    }

    modifier notFinalized(uint256 _nftID) {
        require(!saleFinalized[_nftID], "Sale already finalized");
        _;
    }

    // =====CONSTRUCTOR =====
    constructor(
        address _nftAddress, 
        address payable _seller, 
        address _inspector, 
        address _lender) {
            nftAddress = _nftAddress;
            seller = _seller;
            inspector = _inspector;
            lender = _lender;

    }

    // ===== FUNCTIONS =====
    // Approve Sale
    function approveSale(uint256 _nftID) public {
        approval[_nftID][msg.sender] = true;
    }

    function list(
        uint256 _nftID, 
        address _buyer, 
        uint256 _purchasePrice, 
        uint256 _escrowAmount
        ) public payable onlySeller {
        // Transfer NFT from seller to this contract
        IERC721(nftAddress).transferFrom(msg.sender, address(this), _nftID);

        isListed[_nftID] = true;
        purchasePrice[_nftID] = _purchasePrice;
        escrowAmount[_nftID] = _escrowAmount;
        buyer[_nftID] = _buyer;

        emit Listed(_nftID, _buyer, _purchasePrice); // Added event emission

    }

    // Put under Contract (Only buyer - payable escrow)
    // Fix: Add missing buyer modifier check in depositEarnest
    function depositEarnest(uint256 _nftID) external payable onlyBuyer(_nftID) onlyListed(_nftID) notFinalized(_nftID) nonReentrant {
        require(msg.value >= escrowAmount[_nftID], "Insufficient earnest amount");
        // Emit an event for transparency
        emit DepositMade(_nftID, msg.sender, msg.value);
    }

    // Update inspection Status (only inspector)
    function updateInspectionStatus(uint256 _nftID, bool _passed) public onlyInspector notFinalized(_nftID) {
        inspectionPassed[_nftID] = _passed;
        emit InspectionPassed(_nftID, _passed);
    }

    // Finalize Sale
    // -> Require inspection status (add more items here, like appraisal)
    // -> Require sale to be authorize
    // -> Require funds to be correct amount
    // -> Transfer NFT to buyer
    // -> Transfer funds to Seller
    function finalizeSale(uint256 _nftID) public onlyBuyer(_nftID) onlyListed(_nftID) notFinalized(_nftID) {
        require(inspectionPassed[_nftID], "Inspection not passed");
        require(approval[_nftID][buyer[_nftID]], "Buyer approval missing");
        require(approval[_nftID][seller], "Seller approval missing");
        require(approval[_nftID][lender], "Lender approval missing");
        require(address(this).balance >= purchasePrice[_nftID], "Insufficient funds");

        saleFinalized[_nftID] = true;

        // Trasfer NFT to buyer
        IERC721(nftAddress).transferFrom(address(this), buyer[_nftID], _nftID);

        // Transfer funds to seller
        (bool success, ) = seller.call{value: purchasePrice[_nftID]}("");
        require(success, "Transfer failed");

        emit SaleFinalized(_nftID, buyer[_nftID], purchasePrice[_nftID]);

    }

    // Cancel Sale
    function cancel(uint256 _nftID) public onlyListed(_nftID) notFinalized(_nftID) {
        require(
            msg.sender == buyer[_nftID] ||
            msg.sender == seller ||
            msg.sender == inspector, 
            "Unauthorized"
        );

        // Return NFT to seller
        IERC721(nftAddress).transferFrom(address(this), seller, _nftID);

        // Return funds to buyer if any
        if(address(this).balance > 0) {
            (bool success, ) = buyer[_nftID].call{value: address(this).balance}("");
            require(success, "Transfer failed");
        }
        isListed[_nftID] = false;
        emit Cancelled(_nftID);
    } 

    receive() external payable{}
    fallback() external payable{}

    // Get Balance
    function getBalance() external view returns(uint256) {
        return address(this).balance;
    }
}