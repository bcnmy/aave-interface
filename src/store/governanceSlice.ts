import {
  AaveGovernanceService,
  ERC20_2612Service,
  EthereumTransactionTypeExtended,
  GovDelegate,
  GovDelegateByType,
  GovDelegateTokensBySig,
  GovDelegateTokensByTypeBySig,
  GovernancePowerDelegationTokenService,
  GovPrepareDelegateSig,
  GovPrepareDelegateSigByType,
  Power,
  tEthereumAddress,
} from '@aave/contract-helpers';
import { normalize, valueToBigNumber } from '@aave/math-utils';
import { governanceConfig } from 'src/ui-config/governanceConfig';
import { getProvider } from 'src/utils/marketsAndNetworksConfig';
import { StateCreator } from 'zustand';

import { RootStore } from './root';

export interface GovernanceSlice {
  powers?: {
    votingPower: string;
    propositionPower: string;
    aaveVotingDelegatee: string;
    aavePropositionDelegatee: string;
    stkAaveVotingDelegatee: string;
    stkAavePropositionDelegatee: string;
    aaveTokenPower: Power;
    stkAaveTokenPower: Power;
  };
  delegate: (args: Omit<GovDelegate, 'user'>) => Promise<EthereumTransactionTypeExtended[]>;
  prepareDelegateSignature: (args: GovPrepareDelegateSig) => Promise<string>;
  prepareDelegateByTypeSignature: (args: GovPrepareDelegateSigByType) => Promise<string>;
  delegateByType: (
    args: Omit<GovDelegateByType, 'user'>
  ) => Promise<EthereumTransactionTypeExtended[]>;
  submitVote: AaveGovernanceService['submitVote'];
  getVoteOnProposal: AaveGovernanceService['getVoteOnProposal'];
  getVotingPowerAt: AaveGovernanceService['getVotingPowerAt'];
  refreshGovernanceData: () => Promise<void>;
  getTokenNonce: (user: string, token: string) => Promise<number>;
  delegateTokensBySig: (args: GovDelegateTokensBySig) => Promise<EthereumTransactionTypeExtended[]>;
  delegateTokensByTypeBySig: (
    args: GovDelegateTokensByTypeBySig
  ) => Promise<EthereumTransactionTypeExtended[]>;
}

const checkIfDelegateeIsUser = (delegatee: tEthereumAddress, userAddress: tEthereumAddress) =>
  delegatee.toLocaleLowerCase() === userAddress.toLocaleLowerCase() ? '' : delegatee;

export const createGovernanceSlice: StateCreator<
  RootStore,
  [['zustand/subscribeWithSelector', never], ['zustand/devtools', never]],
  [],
  GovernanceSlice
> = (set, get) => {
  function getCorrectProvider() {
    const currentNetworkConfig = get().currentNetworkConfig;
    const isStakeFork =
      currentNetworkConfig.isFork &&
      currentNetworkConfig.underlyingChainId === governanceConfig?.chainId;
    return isStakeFork ? get().jsonRpcProvider() : getProvider(governanceConfig.chainId);
  }
  return {
    delegateByType: (args) => {
      const service = new GovernancePowerDelegationTokenService(getCorrectProvider());
      const user = get().account;
      return service.delegateByType({ ...args, user });
    },
    prepareDelegateByTypeSignature: (args) => {
      const service = new GovernancePowerDelegationTokenService(getCorrectProvider());
      return service.prepareDelegateByTypeSignature(args);
    },
    prepareDelegateSignature: (args) => {
      const service = new GovernancePowerDelegationTokenService(getCorrectProvider());
      return service.prepareDelegateSignature(args);
    },
    delegate: (args) => {
      const service = new GovernancePowerDelegationTokenService(getCorrectProvider());
      const user = get().account;
      return service.delegate({ ...args, user });
    },
    submitVote: (args) => {
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      return governanceService.submitVote(args);
    },
    getVoteOnProposal: (args) => {
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      return governanceService.getVoteOnProposal(args);
    },
    getVotingPowerAt: (args) => {
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      return governanceService.getVotingPowerAt(args);
    },
    refreshGovernanceData: async () => {
      const account = get().account;
      if (!account) return;
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      const { aaveTokenAddress, stkAaveTokenAddress } = governanceConfig;
      try {
        const [aaveTokenPower, stkAaveTokenPower] = await governanceService.getTokensPower({
          user: account,
          tokens: [aaveTokenAddress, stkAaveTokenAddress],
        });
        const powers = {
          votingPower: normalize(
            valueToBigNumber(aaveTokenPower.votingPower.toString())
              .plus(stkAaveTokenPower.votingPower.toString())
              .toString(),
            18
          ),
          aaveTokenPower,
          stkAaveTokenPower,
          propositionPower: normalize(
            valueToBigNumber(aaveTokenPower.propositionPower.toString())
              .plus(stkAaveTokenPower.propositionPower.toString())
              .toString(),
            18
          ),
          aaveVotingDelegatee: checkIfDelegateeIsUser(
            aaveTokenPower.delegatedAddressVotingPower,
            account
          ),
          aavePropositionDelegatee: checkIfDelegateeIsUser(
            aaveTokenPower.delegatedAddressPropositionPower,
            account
          ),
          stkAaveVotingDelegatee: checkIfDelegateeIsUser(
            stkAaveTokenPower.delegatedAddressVotingPower,
            account
          ),
          stkAavePropositionDelegatee: checkIfDelegateeIsUser(
            stkAaveTokenPower.delegatedAddressPropositionPower,
            account
          ),
        };
        set({ powers });
      } catch (e) {
        console.log('error fetching reserves');
      }
    },
    getTokenNonce: async (user: string, token: string) => {
      const service = new ERC20_2612Service(getCorrectProvider());
      const nonce = await service.getNonce({ token, owner: user });
      return nonce || 0;
    },
    delegateTokensBySig: async (args) => {
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      return governanceService.delegateTokensBySig(args);
    },
    delegateTokensByTypeBySig: async (args) => {
      const governanceService = new AaveGovernanceService(getCorrectProvider(), {
        GOVERNANCE_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2,
        GOVERNANCE_HELPER_ADDRESS: governanceConfig.addresses.AAVE_GOVERNANCE_V2_HELPER,
        ipfsGateway: governanceConfig.ipfsGateway,
      });
      return governanceService.delegateTokensByTypeBySig(args);
    },
  };
};
