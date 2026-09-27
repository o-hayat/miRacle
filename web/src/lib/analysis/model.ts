import type { Influence, ModelAsset } from "./types";

export function score(features: Record<string, number>, model: ModelAsset) {
  let logit = model.intercept;
  model.feature_names.forEach((name, i) => {
    logit +=
      ((features[name] - model.mean[i]) / model.scale[i]) *
      model.coefficients[i];
  });
  return 1 / (1 + Math.exp(-logit));
}
export function explain(
  features: Record<string, number>,
  model: ModelAsset,
): Influence[] {
  const base = score(features, model);
  return model.feature_names
    .map((name, i): Influence => {
      const delta =
        base - score({ ...features, [name]: model.medians[i] }, model);
      return {
        feature: model.feature_labels[name] ?? name.replaceAll("_", " "),
        delta_score: delta,
        direction: delta >= 0 ? "supports" : "cautions",
      };
    })
    .sort((a, b) => Math.abs(b.delta_score) - Math.abs(a.delta_score))
    .slice(0, 5);
}
