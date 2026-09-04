// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1

import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const SEPOLIA_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const TOKEN_UNIT = 10n ** 6n;
const POSITION_LIQUIDITY = 1_000_000n * TOKEN_UNIT;
const MAKER_RESERVE_BUFFER = 200_000n * TOKEN_UNIT;
const FAUCET_AMOUNT = 1_000n * TOKEN_UNIT;
const FAUCET_SUPPLY_CAP = 100_000n * TOKEN_UNIT;
const RATE_6_TO_18 = 10n ** 12n;
const LINEAR_WIDTH = 100n * 10n ** 27n;
const MAX_STALENESS = 365 * 24 * 60 * 60;
const TRIGGER_RATIO_E18 = 98n * 10n ** 16n;
const UNWIND_DISCOUNT_BPS = 50;
const ORDER_SALT = 20_260_904;
const SEPOLIA_CHAIN_ID = 11_155_111n;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, ethers, getNamedAccounts, network } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const waitConfirmations = network.name === "sepolia" ? 2 : 1;
    const initializationTransactions: Record<string, string> = {};

    if (!(network.name === "hardhat" || network.name === "localhost" || network.name === "sepolia")) {
        throw new Error(`BreakwaterPublic does not support network '${network.name}'`);
    }

    const providerChainId = (await ethers.provider.getNetwork()).chainId;
    if (network.name === "sepolia" && providerChainId !== SEPOLIA_CHAIN_ID) {
        throw new Error(
            `Refusing to deploy: Sepolia RPC returned chain ID ${providerChainId}, expected ${SEPOLIA_CHAIN_ID}`,
        );
    }

    log(`Commissioning Breakwater public market from ${deployer}`);
    if (network.name === "sepolia" && await ethers.provider.getCode(SEPOLIA_WETH) === "0x") {
        throw new Error(`Canonical Sepolia WETH has no code at ${SEPOLIA_WETH}`);
    }

    const aqua = await deploy("BreakwaterPublicAqua", {
        contract: "Aqua",
        from: deployer,
        args: [],
        log: true,
        waitConfirmations,
    });
    const router = await deploy("BreakwaterPublicRouter", {
        contract: "AquaSwapVMRouter",
        from: deployer,
        args: [aqua.address, SEPOLIA_WETH, deployer, "Breakwater SwapVM", "1.0.2"],
        log: true,
        waitConfirmations,
    });
    const amm = await deploy("BreakwaterPublicAMM", {
        contract: "BreakwaterAMM",
        from: deployer,
        args: [aqua.address],
        log: true,
        waitConfirmations,
    });
    const badToken = await deploy("BreakwaterDemoBadToken", {
        contract: "DemoFaucetToken",
        from: deployer,
        args: [
            "Breakwater Impaired USD",
            "bUSD",
            6,
            POSITION_LIQUIDITY + MAKER_RESERVE_BUFFER,
            FAUCET_AMOUNT,
            FAUCET_SUPPLY_CAP,
        ],
        log: true,
        waitConfirmations,
    });
    const goodToken = await deploy("BreakwaterDemoGoodToken", {
        contract: "DemoFaucetToken",
        from: deployer,
        args: [
            "Breakwater Reserve USD",
            "rUSD",
            6,
            POSITION_LIQUIDITY + MAKER_RESERVE_BUFFER,
            FAUCET_AMOUNT,
            FAUCET_SUPPLY_CAP,
        ],
        log: true,
        waitConfirmations,
    });
    const badFeed = await deploy("BreakwaterDemoBadFeed", {
        contract: "DemoPriceFeed",
        from: deployer,
        args: [8, 94_000_000, "Breakwater demo bUSD / USD"],
        log: true,
        waitConfirmations,
    });
    const goodFeed = await deploy("BreakwaterDemoGoodFeed", {
        contract: "DemoPriceFeed",
        from: deployer,
        args: [8, 100_000_000, "Breakwater demo rUSD / USD"],
        log: true,
        waitConfirmations,
    });
    const guard = await deploy("BreakwaterPublicGuard", {
        contract: "BreakwaterGuard",
        from: deployer,
        args: [
            router.address,
            badToken.address,
            goodToken.address,
            badFeed.address,
            goodFeed.address,
            MAX_STALENESS,
            TRIGGER_RATIO_E18,
            UNWIND_DISCOUNT_BPS,
        ],
        log: true,
        waitConfirmations,
    });

    const maker = await ethers.getSigner(deployer);
    const ammContract = await ethers.getContractAt("BreakwaterAMM", amm.address, maker);
    const built = await ammContract.buildProgram(
        deployer,
        badToken.address,
        goodToken.address,
        guard.address,
        POSITION_LIQUIDITY,
        POSITION_LIQUIDITY,
        RATE_6_TO_18,
        RATE_6_TO_18,
        LINEAR_WIDTH,
        ORDER_SALT,
        0,
    );
    const order = { maker: built.maker, traits: built.traits, data: built.data };
    const routerContract = await ethers.getContractAt("AquaSwapVMRouter", router.address, maker);
    const aquaContract = await ethers.getContractAt("Aqua", aqua.address, maker);
    const badContract = await ethers.getContractAt("DemoFaucetToken", badToken.address, maker);
    const goodContract = await ethers.getContractAt("DemoFaucetToken", goodToken.address, maker);
    const orderHash = await routerContract.hash(order);
    const [badExisting, goodExisting] = await Promise.all([
        aquaContract.rawBalances(deployer, router.address, orderHash, badToken.address),
        aquaContract.rawBalances(deployer, router.address, orderHash, goodToken.address),
    ]);

    const assets = [
        {
            label: "bad",
            token: badToken.address,
            contract: badContract,
            tokensCount: badExisting.tokensCount,
            amount: badExisting.balance < POSITION_LIQUIDITY
                ? POSITION_LIQUIDITY - badExisting.balance
                : 0n,
        },
        {
            label: "good",
            token: goodToken.address,
            contract: goodContract,
            tokensCount: goodExisting.tokensCount,
            amount: goodExisting.balance < POSITION_LIQUIDITY
                ? POSITION_LIQUIDITY - goodExisting.balance
                : 0n,
        },
    ];
    const positionIsNew = assets.every(({ tokensCount }) => tokensCount === 0n);
    const positionIsActive = assets.every(({ tokensCount }) => tokensCount === 2n);
    if (!positionIsNew && !positionIsActive) {
        throw new Error(
            `Refusing to mutate an inconsistent Aqua position (token counts ${badExisting.tokensCount}/${goodExisting.tokensCount})`,
        );
    }
    const assetsToFund = assets.filter(({ amount }) => amount > 0n);

    if (assetsToFund.length > 0) {
        for (const asset of assetsToFund) {
            const reserveBalance = await asset.contract.balanceOf(deployer);
            if (reserveBalance < asset.amount) {
                throw new Error(
                    `Insufficient ${asset.label} maker reserve to restore position: need ${asset.amount}, have ${reserveBalance}`,
                );
            }
            const allowance = await asset.contract.allowance(deployer, aqua.address);
            if (allowance < asset.amount) {
                const approval = await asset.contract.approve(aqua.address, ethers.MaxUint256);
                await approval.wait();
                initializationTransactions[`${asset.label}Approval`] = approval.hash;
            }
        }

        if (positionIsNew) {
            const sorted = assetsToFund.sort((left, right) =>
                left.token.toLowerCase().localeCompare(right.token.toLowerCase())
            );
            const strategy = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address maker,uint256 traits,bytes data)"],
                [order],
            );
            const ship = await aquaContract.ship(
                router.address,
                strategy,
                sorted.map(({ token }) => token),
                sorted.map(({ amount }) => amount),
            );
            await ship.wait();
            initializationTransactions.ship = ship.hash;
        } else {
            for (const asset of assetsToFund) {
                const push = await aquaContract.push(
                    deployer,
                    router.address,
                    orderHash,
                    asset.token,
                    asset.amount,
                );
                await push.wait();
                initializationTransactions[`${asset.label}Push`] = push.hash;
            }
        }
    }

    const deployedAtBlock = await ethers.provider.getBlockNumber();
    const appManifest = {
        chainId: Number(providerChainId),
        deployedAtBlock: deployedAtBlock.toString(),
        explorerUrl: network.name === "sepolia"
            ? "https://sepolia.etherscan.io"
            : "http://localhost:8545",
        aqua: aqua.address,
        router: router.address,
        amm: amm.address,
        guard: guard.address,
        badToken: badToken.address,
        goodToken: goodToken.address,
        badFeed: badFeed.address,
        goodFeed: goodFeed.address,
        orderHash,
        order: {
            maker: order.maker,
            traits: order.traits.toString(),
            data: order.data,
        },
    };
    const deploymentEvidence = {
        ...appManifest,
        deploymentTransactions: {
            aqua: aqua.transactionHash,
            router: router.transactionHash,
            amm: amm.transactionHash,
            badToken: badToken.transactionHash,
            goodToken: goodToken.transactionHash,
            badFeed: badFeed.transactionHash,
            goodFeed: goodFeed.transactionHash,
            guard: guard.transactionHash,
        },
        initializationTransactions,
        parameters: {
            badUsd: "0.94",
            goodUsd: "1.00",
            triggerRatio: "0.98",
            unwindDiscountBps: UNWIND_DISCOUNT_BPS,
            maxStaleness: MAX_STALENESS,
            positionLiquidity: POSITION_LIQUIDITY.toString(),
            makerReserveBuffer: MAKER_RESERVE_BUFFER.toString(),
            faucetAmount: FAUCET_AMOUNT.toString(),
            faucetSupplyCap: FAUCET_SUPPLY_CAP.toString(),
        },
    };
    console.log(`BREAKWATER_PUBLIC_MANIFEST=${JSON.stringify(appManifest)}`);
    console.log(`BREAKWATER_PUBLIC_EVIDENCE=${JSON.stringify(deploymentEvidence)}`);
};

export default func;
func.tags = ["BreakwaterPublic"];
