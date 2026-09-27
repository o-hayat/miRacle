#include <stdlib.h>
#include <string.h>
#include <ViennaRNA/fold.h>
#include <ViennaRNA/plotting/layouts.h>

/* The same defaults as RNA.fold and RNA.svg_rna_plot in ViennaRNA 2.7.2. */
float miracle_fold(const char *sequence, char *structure) {
  return vrna_fold(sequence, structure);
}

int miracle_layout(const char *structure, float *coordinates) {
  float *x = NULL, *y = NULL;
  int length = vrna_plot_coords(structure, &x, &y, VRNA_PLOT_TYPE_NAVIEW);
  if (length > 0) {
    for (int i = 0; i < length; i++) {
      coordinates[2 * i] = x[i];
      coordinates[2 * i + 1] = y[i];
    }
  }
  free(x);
  free(y);
  return length;
}
