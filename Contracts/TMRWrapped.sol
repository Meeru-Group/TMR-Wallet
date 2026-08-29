// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TMRWrapped {
    string public constant name = "Wrapped TMR";
    string public constant symbol = "wTMR";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public immutable bridgeRelayer;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public processedMint;
    mapping(bytes32 => bool) public processedBurn;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event BridgeMinted(bytes32 indexed orderId, address indexed to, uint256 amount);
    event BridgeBurned(bytes32 indexed orderId, address indexed from, uint256 amount, string tmrRecipient);

    modifier onlyRelayer() {
        require(msg.sender == bridgeRelayer, "not relayer");
        _;
    }

    constructor(address relayer) {
        require(relayer != address(0), "zero relayer");
        bridgeRelayer = relayer;
    }

    function mintForBridge(bytes32 orderId, address to, uint256 amount) external onlyRelayer {
        require(!processedMint[orderId], "order already minted");
        require(to != address(0) && amount > 0, "invalid mint");
        processedMint[orderId] = true;
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit BridgeMinted(orderId, to, amount);
    }

    function burnToTMR(bytes32 orderId, uint256 amount, string calldata tmrRecipient) external {
        require(!processedBurn[orderId], "order already burned");
        require(amount > 0 && bytes(tmrRecipient).length >= 35, "invalid burn");
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        processedBurn[orderId] = true;
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit BridgeBurned(orderId, msg.sender, amount, tmrRecipient);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "zero recipient");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
