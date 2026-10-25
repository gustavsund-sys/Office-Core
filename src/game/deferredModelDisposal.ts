import type { Node, Scene, TransformNode } from "@babylonjs/core";

const queues = new WeakMap<Scene, ModelDisposal>();
/** Hide immediately, then release children in leaf-first batches without disposing shared materials. */
export class ModelDisposal {
  private pending: Node[] = [];
  private retired = new WeakSet<TransformNode>();
  constructor(scene: Scene) {
    scene.onBeforeRenderObservable.add(() => this.flush());
    scene.onDisposeObservable.addOnce(() => {
      this.pending.length = 0;
    });
  }
  retire(root: TransformNode) {
    if (root.isDisposed() || this.retired.has(root)) return;
    this.retired.add(root);
    root.setEnabled(false);
    // getDescendants is depth-first: reversing gives children before their parents.
    this.pending.push(...root.getDescendants(false).reverse(), root);
  }
  flush(maxNodes = 8, budgetMs = 1) {
    const deadline = performance.now() + budgetMs;
    let count = 0;
    while (
      this.pending.length &&
      count < maxNodes &&
      performance.now() < deadline
    ) {
      const node = this.pending.shift()!;
      if (!node.isDisposed()) node.dispose(true, false);
      count++;
    }
  }
}
export function retireModel(root: TransformNode) {
  const scene = root.getScene();
  let disposal = queues.get(scene);
  if (!disposal) queues.set(scene, (disposal = new ModelDisposal(scene)));
  disposal.retire(root);
}
