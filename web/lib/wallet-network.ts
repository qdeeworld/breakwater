import type { EIP1193Provider } from 'viem';
import { sepolia } from 'viem/chains';

// Some mobile wallets wrap their original JSON-RPC error.
function errorCode(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== 'object' || depth > 4) return;
  const e = error as {
    code?: number;
    cause?: unknown;
    data?: { originalError?: unknown };
  };
  return (
    errorCode(e.data?.originalError, depth + 1) ??
    errorCode(e.cause, depth + 1) ??
    e.code
  );
}

export async function switchToSepolia(
  provider: EIP1193Provider,
  report: (status: string) => void = () => {},
): Promise<number> {
  const params: [{ chainId: string }] = [{ chainId: '0xaa36a7' }];
  const readChain = async () =>
    Number(await provider.request({ method: 'eth_chainId' }));
  try {
    if ((await readChain()) === sepolia.id) return sepolia.id;
    report('Open your wallet to review the Sepolia network switch.');
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params });
    } catch (error) {
      if (errorCode(error) !== 4902) throw error;
      report(
        'Sepolia is not configured. Open your wallet to approve adding the test network.',
      );
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            ...params[0],
            chainName: sepolia.name,
            nativeCurrency: sepolia.nativeCurrency,
            rpcUrls: [...sepolia.rpcUrls.default.http],
            blockExplorerUrls: [sepolia.blockExplorers.default.url],
          },
        ],
      });
      // Adding a chain does not require the wallet to select it.
      if ((await readChain()) !== sepolia.id) {
        report('Sepolia added. Open your wallet to approve switching to it.');
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params,
        });
      }
    }
    const chain = await readChain();
    if (chain !== sepolia.id) {
      throw new Error(
        'Your wallet is still on another network. Select Sepolia in the wallet network menu, then retry.',
      );
    }
    report('Wallet connected to Sepolia.');
    return chain;
  } catch (error) {
    switch (errorCode(error)) {
      case 4001:
        throw new Error(
          'Network request declined. Select Sepolia in your wallet or retry when ready.',
        );
      case -32002:
        throw new Error(
          'A wallet request is already pending. Open your wallet and review it before retrying.',
        );
      case 4200:
      case -32601:
        throw new Error(
          'This wallet cannot switch networks from the app. Enable test networks and select Sepolia in your wallet.',
        );
      default:
        throw error;
    }
  }
}
