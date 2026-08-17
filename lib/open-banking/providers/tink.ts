import type { ProviderConfiguration } from "../config";
import { ConfiguredProviderSkeleton } from "./configured-skeleton";
export class TinkProvider extends ConfiguredProviderSkeleton { readonly id = "tink"; constructor(config: ProviderConfiguration) { super(config); } }
