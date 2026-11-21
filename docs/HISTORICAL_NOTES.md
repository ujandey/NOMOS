# Historical notes

NOMOS uses the alignment-nomogram mechanism described in the V2 PRD. Positions on calibrated scales encode transformed quantities. The two known positions define a straight line, and the inverse of the middle scale gives the unknown value at the crossing.

For F1, the crossing averages two reciprocal coordinates. For cost, the middle scale halves the outer logarithmic slope so the coordinate average reads the sum of the logarithms. The implementation inverts the coordinate before showing the independent check.

Aviation instruments inspire the visual vocabulary. The envelope projection represents a discrete set of synthetic evaluations and solver decisions.
