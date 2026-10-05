import {
  getAddress,
  toHex,
  stringToHex,
  type Address,
  type Chain,
  type EIP1193Provider,
} from "viem";

export type BrowserWallet = EIP1193Provider & {
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  providers?: BrowserWallet[];
};
export type WalletState = {
  account: Address | null;
  chain: number | null;
  busy: boolean;
  status: string;
  error: string;
};

type ErrorFields = {
  code?: unknown;
  cause?: unknown;
  data?: unknown;
  message?: unknown;
  shortMessage?: unknown;
};

function objectFields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function errorCode(value: unknown): unknown {
  const error = objectFields(value) as ErrorFields;
  const cause = objectFields(error.cause);
  const data = objectFields(error.data);
  const originalError = objectFields(data.originalError);
  return error.code ?? cause.code ?? originalError.code;
}

function accountList(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  return value.filter((account): account is Address => typeof account === "string");
}

export function walletError(value: unknown): string {
  const error = objectFields(value) as ErrorFields;
  const code = errorCode(value);
  const message = typeof error.message === "string" ? error.message : "";
  const shortMessage =
    typeof error.shortMessage === "string" ? error.shortMessage : "";
  if (code === 4001) return "Wallet request cancelled. Please try again when ready.";
  if (code === -32002)
    return "A wallet request is already pending. Open your wallet extension to approve or cancel it.";
  if (/chain.?id.*match|chain id.*verification/i.test(message))
    return "Wallet network does not match the login request. Reconnect and approve the requested network before signing in.";
  return shortMessage || message || "Wallet request failed.";
}

export class WalletController {
  state: WalletState = {
    account: null,
    chain: null,
    busy: false,
    status: "",
    error: "",
  };
  private epoch = 0;
  private candidate: Address | null = null;
  private stopped = false;
  private operation: Promise<Address> | null = null;
  private logout: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    public provider: BrowserWallet,
    private auth: (action: string, body?: unknown) => Promise<unknown>,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private update(patch: Partial<WalletState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout>;
    const providerRequest = this.provider.request as (this: BrowserWallet, args: {
      method: string;
      params?: unknown;
    }) => Promise<unknown>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Wallet request timed out. Open the extension and resolve any pending request, then retry.",
            ),
          ),
        90000,
      );
    });
    return Promise.race([
      providerRequest.call(
        this.provider,
        { method, ...(params === undefined ? {} : { params }) },
      ),
      timeout,
    ]).finally(() => clearTimeout(timer));
  }

  private invalidate() {
    this.epoch++;
    this.candidate = null;
    this.update({ account: null });
    this.logout = this.logout.catch(() => {}).then(() => this.auth("logout", {}));
    void this.logout.catch(() => {});
  }

  private accountsChanged: (...args: unknown[]) => void = (...args) => {
    const accounts = accountList(args[0]);
    const current = this.candidate || this.state.account;
    if (current && current.toLowerCase() !== accounts[0]?.toLowerCase()) {
      this.invalidate();
      this.update({ status: "Wallet changed. Connect and sign in again." });
    }
  };

  private chainChanged: (...args: unknown[]) => void = (...args) => {
    const chain = Number(args[0]);
    this.update({ chain: Number.isSafeInteger(chain) ? chain : null });
  };

  private disconnected: (...args: unknown[]) => void = () => {
    this.stopped = true;
    this.invalidate();
    this.update({ chain: null, status: "Wallet disconnected." });
  };

  start() {
    this.provider.on("accountsChanged", this.accountsChanged);
    this.provider.on("chainChanged", this.chainChanged);
    this.provider.on("disconnect", this.disconnected);
    void this.sync();
    return () => {
      this.epoch++;
      this.provider.removeListener("accountsChanged", this.accountsChanged);
      this.provider.removeListener("chainChanged", this.chainChanged);
      this.provider.removeListener("disconnect", this.disconnected);
    };
  }

  async sync() {
    if (this.state.busy || this.stopped) return;
    const epoch = this.epoch;
    try {
      const [accountsValue, chainValue, sessionValue] = await Promise.all([
        this.request("eth_accounts"),
        this.request("eth_chainId"),
        this.auth("session"),
      ]);
      if (epoch !== this.epoch || this.state.busy || this.stopped) return;
      const accounts = accountList(accountsValue);
      const sessionAccount = objectFields(sessionValue).account;
      const hasMatchingSession =
        typeof sessionAccount === "string" &&
        sessionAccount.toLowerCase() === accounts[0]?.toLowerCase();
      const account = accounts[0] && hasMatchingSession ? getAddress(accounts[0]) : null;
      if (!account && sessionAccount) this.invalidate();
      const chain = Number(chainValue);
      this.update({ account, chain: Number.isSafeInteger(chain) ? chain : null });
    } catch (error) {
      if (epoch === this.epoch)
        this.update({ account: null, error: walletError(error) });
    }
  }

  connect(targetChain?: Chain): Promise<Address> {
    if (this.operation) return this.operation;
    if (this.state.busy)
      return Promise.reject(new Error("Finish the current wallet request first."));
    this.operation = this.signIn(targetChain).finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  private async signIn(targetChain?: Chain): Promise<Address> {
    const epoch = ++this.epoch;
    this.stopped = false;
    this.update({ busy: true, error: "", status: "Approve connection in your wallet." });
    try {
      await this.logout;
      const accounts = accountList(await this.request("eth_requestAccounts"));
      if (!accounts[0]) throw new Error("No wallet account selected.");
      const account = getAddress(accounts[0]);
      this.candidate = account;
      const check = async () => {
        const latest = accountList(await this.request("eth_accounts"));
        if (
          epoch !== this.epoch ||
          latest[0]?.toLowerCase() !== account.toLowerCase()
        )
          throw new Error("Wallet changed during sign-in. Please reconnect.");
      };
      await check();
      if (targetChain) await this.switchTo(targetChain);
      const session = objectFields(await this.auth("session"));
      if (
        typeof session.account !== "string" ||
        session.account.toLowerCase() !== account.toLowerCase()
      ) {
        await this.auth("logout", {});
        const challenge = objectFields(
          await this.auth("challenge", { account }),
        );
        if (typeof challenge.message !== "string" || typeof challenge.id !== "string")
          throw new Error("Wallet login challenge was invalid.");
        this.update({
          status: "Sign the login message in your wallet. No transaction or gas fee.",
        });
        if (targetChain) await this.switchTo(targetChain);
        const signature = await this.request("personal_sign", [
          stringToHex(challenge.message),
          account,
        ]);
        if (typeof signature !== "string")
          throw new Error("Wallet returned an invalid signature.");
        await check();
        await this.auth("verify", { id: challenge.id, signature });
        await check();
      }
      await check();
      const chain = Number(await this.request("eth_chainId"));
      if (epoch !== this.epoch) throw new Error("Wallet changed. Please reconnect.");
      this.update({
        account,
        chain: Number.isSafeInteger(chain) ? chain : null,
        status: "Signed in.",
      });
      return account;
    } catch (error) {
      this.invalidate();
      this.update({ error: walletError(error), status: "" });
      throw error;
    } finally {
      this.candidate = null;
      this.update({ busy: false });
    }
  }

  async disconnect() {
    this.stopped = true;
    this.invalidate();
    this.update({ busy: true, status: "Signing out…", error: "" });
    try {
      await this.logout;
      this.update({ status: "Signed out. A new connection requires a login signature." });
    } catch (error) {
      this.update({ busy: false, error: walletError(error) });
      throw error;
    }
    this.update({ busy: false });
  }

  async switchChain(chain: Chain) {
    if (this.state.busy)
      throw new Error("Finish the current wallet request first.");
    this.update({ busy: true, error: "", status: "Confirm the network switch in your wallet." });
    try {
      await this.switchTo(chain);
    } catch (error) {
      this.update({ error: walletError(error), status: "" });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }

  private async switchTo(chain: Chain) {
    if (Number(await this.request("eth_chainId")) !== chain.id) {
      this.update({ status: "Confirm the network switch in your wallet." });
      try {
        await this.request("wallet_switchEthereumChain", [
          { chainId: toHex(chain.id) },
        ]);
      } catch (error) {
        if (errorCode(error) !== 4902) throw error;
        await this.request("wallet_addEthereumChain", [
          {
            chainId: toHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers?.default
              ? [chain.blockExplorers.default.url]
              : [],
          },
        ]);
        await this.request("wallet_switchEthereumChain", [
          { chainId: toHex(chain.id) },
        ]);
      }
    }
    const actual = Number(await this.request("eth_chainId"));
    this.update({ chain: Number.isSafeInteger(actual) ? actual : null });
    if (actual !== chain.id)
      throw new Error("Wallet did not switch networks. Confirm the request in your extension.");
    this.update({ status: `Connected to ${chain.name}.` });
  }
}
