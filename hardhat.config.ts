// hardhat.config.js (ES Module for Hardhat v3)
import 'dotenv/config'; // 自动加载 .env 文件中的环境变量

// 导入 v3 所需的插件和工具
import { defineConfig } from 'hardhat/config';
import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';


export default defineConfig({
  // 插件列表：注册所有需要启用的 Hardhat 插件
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
      type: 'http', // 明确指定网络类型为 HTTP
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