import type { ProviderConfiguration } from "../config";
import { ConfiguredProviderSkeleton } from "./configured-skeleton";
export class EnableBankingProvider extends ConfiguredProviderSkeleton { readonly id = "enable-banking"; constructor(config: ProviderConfiguration) { super(config); } }
