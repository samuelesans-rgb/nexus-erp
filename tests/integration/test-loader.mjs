// Custom loader to mock server-only
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return {
      url: new URL('../stubs/server-only/index.js', import.meta.url).href,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  return next(url, context);
}
