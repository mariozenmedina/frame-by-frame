export interface ReleasePackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly private?: unknown;
  readonly license?: unknown;
  readonly repository?: unknown;
  readonly publishConfig?: unknown;
}

export interface ReleaseContractInput {
  readonly packageJson: ReleasePackageJson;
  readonly changelog: string;
  readonly publishable?: boolean;
  readonly tag?: string;
  readonly channel?: string;
}

export declare const validateReleaseContract: (input: ReleaseContractInput) => string[];
