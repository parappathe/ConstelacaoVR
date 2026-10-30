// Gancho do Node: quando o jogo importa o Three.js, entrega a versão com o WebGLRenderer de
// mentira (tests/smoke/three-stub.js). O próprio stub importa o Three.js de verdade com "?real".
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('vendor/three/three.module.js') && !context.parentURL?.includes('three-stub.js')) {
    return next(new URL('./three-stub.js', import.meta.url).href, context);
  }
  return next(specifier, context);
}
