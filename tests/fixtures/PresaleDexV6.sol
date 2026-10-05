// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

// Test doubles only, written to follow Uniswap V2 semantics closely enough to exercise direct pair minting:
// mint() reads balance minus reserve, MINIMUM_LIQUIDITY is burned on the first mint, sync/skim exist.
// Never included in deployment artifacts.
contract V2WETH is ERC20 {
    constructor() ERC20('Wrapped Ether', 'WETH') {}
    function deposit() external payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 amount) external { _burn(msg.sender, amount); (bool ok,) = msg.sender.call{value: amount}(''); require(ok); }
}

contract V2Pair is ERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address public token0; address public token1; address public factory;
    uint112 private reserve0; uint112 private reserve1;
    constructor() ERC20('Uniswap V2', 'UNI-V2') { factory = msg.sender; }
    function initialize(address a, address b) external { require(msg.sender == factory, 'FORBIDDEN'); token0 = a; token1 = b; }
    function getReserves() external view returns (uint112, uint112, uint32) { return (reserve0, reserve1, 0); }
    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) { z = y; uint256 x = y / 2 + 1; while (x < z) { z = x; x = (y / x + x) / 2; } } else if (y != 0) { z = 1; }
    }
    function mint(address to) external returns (uint256 liquidity) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;
        uint256 supply = totalSupply();
        if (supply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            uint256 l0 = amount0 * supply / reserve0; uint256 l1 = amount1 * supply / reserve1;
            liquidity = l0 < l1 ? l0 : l1;
        }
        require(liquidity > 0, 'INSUFFICIENT_LIQUIDITY_MINTED');
        _mint(to, liquidity);
        reserve0 = uint112(balance0); reserve1 = uint112(balance1);
    }
    function sync() external {
        reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
    }
}

contract V2Factory {
    mapping(address => mapping(address => address)) public getPair;
    function createPair(address a, address b) external returns (address pair) {
        require(a != b && getPair[a][b] == address(0), 'PAIR_EXISTS');
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        pair = address(new V2Pair());
        V2Pair(pair).initialize(t0, t1);
        getPair[a][b] = pair; getPair[b][a] = pair;
    }
}

contract V2Router {
    address public immutable factory; address public immutable WETH;
    constructor(address f, address w) { factory = f; WETH = w; }
    function _amounts(address pairAddr, address token, uint256 desired, uint256 ethIn) private view returns (uint256 amountT, uint256 amountE) {
        (uint112 r0, uint112 r1,) = V2Pair(pairAddr).getReserves();
        (uint256 rT, uint256 rE) = V2Pair(pairAddr).token0() == token ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        if (rT == 0 && rE == 0) return (desired, ethIn);
        uint256 eOpt = desired * rE / rT;
        if (eOpt <= ethIn) return (desired, eOpt);
        return (ethIn * rT / rE, ethIn);
    }
    function addLiquidityETH(address token, uint256 desired, uint256 minT, uint256 minE, address to, uint256 deadline)
        external payable returns (uint256 amountT, uint256 amountE, uint256 liquidity)
    {
        require(deadline >= block.timestamp, 'EXPIRED');
        address pairAddr = V2Factory(factory).getPair(token, WETH);
        if (pairAddr == address(0)) pairAddr = V2Factory(factory).createPair(token, WETH);
        (amountT, amountE) = _amounts(pairAddr, token, desired, msg.value);
        require(amountT >= minT && amountE >= minE, 'SLIPPAGE');
        IERC20(token).transferFrom(msg.sender, pairAddr, amountT);
        V2WETH(WETH).deposit{value: amountE}();
        IERC20(WETH).transfer(pairAddr, amountE);
        liquidity = V2Pair(pairAddr).mint(to);
        if (msg.value > amountE) { (bool r,) = msg.sender.call{value: msg.value - amountE}(''); require(r); }
    }
}
// Attacker helper: receives ETH-reject behaviour and can poke a pair.
contract V2Griefer {
    function wrapAndSend(address weth, address pair) external payable {
        (bool ok,) = weth.call{value: msg.value}(abi.encodeWithSignature('deposit()')); require(ok);
        IERC20(weth).transfer(pair, msg.value);
    }
}
contract V2RejectETH { receive() external payable { revert('Reject'); } }

