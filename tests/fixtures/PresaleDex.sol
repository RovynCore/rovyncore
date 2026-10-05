// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
// Test double only. Never included in the deployment artifacts.
contract MockAsset is ERC20 { constructor() ERC20('Wrapped','WETH') {} }
contract MockPair is ERC20 {
    address public token0; address public token1;
    uint112 private r0;uint112 private r1;
    constructor(address a,address b) ERC20('LP','LP'){token0=a;token1=b;}
    function mint(address to,uint256 amount,uint256 a,uint256 b) external {r0=uint112(a);r1=uint112(b);_mint(to,amount);}
    function getReserves() external view returns(uint112,uint112,uint32){return(r0,r1,0);}
}
contract MockDex {
    address public WETH; address public pair; bool public broken;
    constructor(){WETH=address(new MockAsset());}
    function factory() external view returns(address){return address(this);}
    function getPair(address,address) external view returns(address){return pair;}
    function setBroken(bool b) external {broken=b;}
    function addLiquidityETH(address token,uint amount,uint minT,uint minE,address to,uint deadline) external payable returns(uint,uint,uint){
        require(!broken && deadline>=block.timestamp && minT==amount && minE==msg.value,'DEX failed');
        if(pair==address(0)) pair=address(new MockPair(token,WETH));
        require(IERC20(token).transferFrom(msg.sender,pair,amount));
        MockPair(pair).mint(to,msg.value,amount,msg.value);
        return(amount,msg.value,msg.value);
    }
}
contract RejectETH { receive() external payable {revert('Reject');} }
