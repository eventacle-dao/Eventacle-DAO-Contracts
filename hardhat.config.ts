// Hardhat 3 + Viem（ES Module）
import "dotenv/config";

import { defineConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],

  // Solidity 编译器配置（支持多配置文件）
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
        settings: {
          // 默认配置下不启用优化器，适合开发和调试
        },
      },
      production: {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200, // 优化次数，根据合约复杂度调整
          },
        },
      },
    },
  },

  // 网络配置
  networks: {
    inj_testnet: {
      url: process.env.INJ_TESTNET_RPC_URL || 'https://k8s.testnet.json-rpc.injective.network/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1439,
      type: 'http',
    },
    inj_mainnet: {
      url: process.env.INJ_MAINNET_RPC_URL || 'https://sentry.evm-rpc.injective.network/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1776,
      type: 'http',
    },
  },

  // 链描述符：为自定义链提供区块浏览器等（Hardhat v3 用于 verify 等）
  chainDescriptors: {
    1439: {
      name: 'Injective Testnet',
      blockExplorers: {
        etherscan: {
          url: 'https://testnet.blockscout.injective.network',
          apiUrl: 'https://testnet.blockscout-api.injective.network/api',
        },
        blockscout: {
          url: 'https://testnet.blockscout.injective.network',
          apiUrl: 'https://testnet.blockscout-api.injective.network/api',
        },
      },
    },
    1776: {
      name: 'Injective Mainnet',
      blockExplorers: {
        etherscan: {
          url: 'https://explorer.injective.network',
          apiUrl: 'https://explorer.injective.network/api',
        },
        blockscout: {
          url: 'https://blockscout.injective.network',
          apiUrl: 'https://blockscout-api.injective.network/api',
        },
      },
    },
  },

  // 合约验证配置（Hardhat v3 下位于 verify 命名空间）
  verify: {
    etherscan: {
      apiKey: 'nil', // 自定义网络可填占位符；主网/常用链需填真实 API Key
      enabled: true,
    },
    sourcify: {
      enabled: false, // 设置为 true 以启用 Sourcify 验证
    },
  },
});