// Default patterns for the NeetCode 150 topics: topic slug → [pattern name, LeetCode numbers][].
export const PATTERNS: Record<string, [string, number[]][]> = {
  "arrays-hashing": [
    ["Hash set / map lookup", [217, 242, 1, 36, 128]],
    ["Grouping & frequency count", [49, 347]],
    ["Prefix / suffix products", [238]],
    ["String encoding", [271]],
  ],
  "two-pointers": [
    ["Opposite ends", [125, 167, 15, 11]],
    ["Left / right max boundaries", [42]],
  ],
  "sliding-window": [
    ["Running min / max", [121]],
    ["Fixed-size window", [567]],
    ["Variable-size window", [3, 424, 76]],
    ["Monotonic deque", [239]],
  ],
  stack: [
    ["Classic stack", [20, 155, 150]],
    ["Stack + backtracking", [22]],
    ["Monotonic stack", [739, 853, 84]],
  ],
  "binary-search": [
    ["Classic search & bounds", [704, 74, 981]],
    ["Binary search on answer", [875]],
    ["Rotated sorted array", [153, 33]],
    ["Partition two arrays", [4]],
  ],
  "linked-list": [
    ["Reversal", [206, 25]],
    ["Fast & slow / gap pointers", [141, 287, 19, 143]],
    ["Merging lists", [21, 23]],
    ["Copy & arithmetic", [138, 2]],
    ["Design", [146]],
  ],
  trees: [
    ["Basic DFS", [226, 104, 100, 572, 1448]],
    ["Height / path DFS", [543, 110, 124]],
    ["BFS / level order", [102, 199]],
    ["BST property", [235, 98, 230]],
    ["Build & serialize", [105, 297]],
  ],
  tries: [
    ["Trie basics", [208, 211]],
    ["Trie + backtracking", [212]],
  ],
  "heap-priority-queue": [
    ["Top-K / Kth element", [703, 973, 215]],
    ["Simulation with heap", [1046, 621]],
    ["Merging streams", [355]],
    ["Two heaps", [295]],
  ],
  backtracking: [
    ["Subsets", [78, 90]],
    ["Combinations", [39, 40, 17]],
    ["Permutations", [46]],
    ["Search & partition", [79, 131]],
    ["Constraint placement", [51]],
  ],
  graphs: [
    ["Grid DFS / BFS", [200, 695, 417, 130]],
    ["Multi-source BFS", [994, 286]],
    ["Graph traversal & cloning", [133]],
    ["Topological sort", [207, 210]],
    ["Union-Find", [684, 323, 261]],
    ["BFS shortest path", [127]],
  ],
  "advanced-graphs": [
    ["Dijkstra", [743, 778]],
    ["Minimum spanning tree", [1584]],
    ["Bellman-Ford / k-step BFS", [787]],
    ["Eulerian path", [332]],
    ["Topological sort", [269]],
  ],
  "1-d-dynamic-programming": [
    ["Fibonacci-style", [70, 746, 198, 213, 91]],
    ["Palindromic substrings", [5, 647]],
    ["Knapsack", [322, 416]],
    ["Subarray / subsequence", [152, 300, 139]],
  ],
  "2-d-dynamic-programming": [
    ["Grid paths", [62, 329]],
    ["Two strings (LCS family)", [1143, 97, 115, 72, 10]],
    ["Knapsack variants", [518, 494]],
    ["State machine", [309]],
    ["Interval DP", [312]],
  ],
  greedy: [
    ["Kadane / running sum", [53, 134]],
    ["Farthest reach", [55, 45]],
    ["Greedy choice", [846, 1899, 763, 678]],
  ],
  intervals: [
    ["Merge & insert", [57, 56]],
    ["Overlap counting", [435, 252, 253]],
    ["Sweep with heap", [1851]],
  ],
  "math-geometry": [
    ["Matrix manipulation", [48, 54, 73]],
    ["Number tricks", [202, 66, 50, 43]],
    ["Geometry with hashing", [2013]],
  ],
  "bit-manipulation": [
    ["XOR tricks", [136, 268, 371]],
    ["Bit counting", [191, 338]],
    ["Bit / digit reversal", [190, 7]],
  ],
};
