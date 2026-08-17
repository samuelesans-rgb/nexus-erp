import type { ProviderConfiguration } from "../config";
import { ConfiguredProviderSkeleton } from "./configured-skeleton";
export class YapilyProvider extends ConfiguredProviderSkeleton { readonly id = "yapily"; constructor(config: ProviderConfiguration) { super(config); } }
