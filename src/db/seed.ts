import { config } from "dotenv";
config({ path: ".env.local" });
import { slugify } from "../lib/slug";

type D = "Easy" | "Medium" | "Hard";
type Row = [title: string, lc: number, diff: D];

// NeetCode 150, grouped by topic.
const SHEET: { name: string; problems: Row[] }[] = [
  { name: "Arrays & Hashing", problems: [
    ["Contains Duplicate", 217, "Easy"], ["Valid Anagram", 242, "Easy"], ["Two Sum", 1, "Easy"],
    ["Group Anagrams", 49, "Medium"], ["Top K Frequent Elements", 347, "Medium"], ["Encode and Decode Strings", 271, "Medium"],
    ["Product of Array Except Self", 238, "Medium"], ["Valid Sudoku", 36, "Medium"], ["Longest Consecutive Sequence", 128, "Medium"],
  ] },
  { name: "Two Pointers", problems: [
    ["Valid Palindrome", 125, "Easy"], ["Two Sum II - Input Array Is Sorted", 167, "Medium"], ["3Sum", 15, "Medium"],
    ["Container With Most Water", 11, "Medium"], ["Trapping Rain Water", 42, "Hard"],
  ] },
  { name: "Sliding Window", problems: [
    ["Best Time to Buy and Sell Stock", 121, "Easy"], ["Longest Substring Without Repeating Characters", 3, "Medium"],
    ["Longest Repeating Character Replacement", 424, "Medium"], ["Permutation in String", 567, "Medium"],
    ["Minimum Window Substring", 76, "Hard"], ["Sliding Window Maximum", 239, "Hard"],
  ] },
  { name: "Stack", problems: [
    ["Valid Parentheses", 20, "Easy"], ["Min Stack", 155, "Medium"], ["Evaluate Reverse Polish Notation", 150, "Medium"],
    ["Generate Parentheses", 22, "Medium"], ["Daily Temperatures", 739, "Medium"], ["Car Fleet", 853, "Medium"],
    ["Largest Rectangle in Histogram", 84, "Hard"],
  ] },
  { name: "Binary Search", problems: [
    ["Binary Search", 704, "Easy"], ["Search a 2D Matrix", 74, "Medium"], ["Koko Eating Bananas", 875, "Medium"],
    ["Find Minimum in Rotated Sorted Array", 153, "Medium"], ["Search in Rotated Sorted Array", 33, "Medium"],
    ["Time Based Key-Value Store", 981, "Medium"], ["Median of Two Sorted Arrays", 4, "Hard"],
  ] },
  { name: "Linked List", problems: [
    ["Reverse Linked List", 206, "Easy"], ["Merge Two Sorted Lists", 21, "Easy"], ["Linked List Cycle", 141, "Easy"],
    ["Reorder List", 143, "Medium"], ["Remove Nth Node From End of List", 19, "Medium"], ["Copy List with Random Pointer", 138, "Medium"],
    ["Add Two Numbers", 2, "Medium"], ["Find the Duplicate Number", 287, "Medium"], ["LRU Cache", 146, "Medium"],
    ["Merge k Sorted Lists", 23, "Hard"], ["Reverse Nodes in k-Group", 25, "Hard"],
  ] },
  { name: "Trees", problems: [
    ["Invert Binary Tree", 226, "Easy"], ["Maximum Depth of Binary Tree", 104, "Easy"], ["Diameter of Binary Tree", 543, "Easy"],
    ["Balanced Binary Tree", 110, "Easy"], ["Same Tree", 100, "Easy"], ["Subtree of Another Tree", 572, "Easy"],
    ["Lowest Common Ancestor of a Binary Search Tree", 235, "Medium"], ["Binary Tree Level Order Traversal", 102, "Medium"],
    ["Binary Tree Right Side View", 199, "Medium"], ["Count Good Nodes in Binary Tree", 1448, "Medium"],
    ["Validate Binary Search Tree", 98, "Medium"], ["Kth Smallest Element in a BST", 230, "Medium"],
    ["Construct Binary Tree from Preorder and Inorder Traversal", 105, "Medium"],
    ["Binary Tree Maximum Path Sum", 124, "Hard"], ["Serialize and Deserialize Binary Tree", 297, "Hard"],
  ] },
  { name: "Tries", problems: [
    ["Implement Trie (Prefix Tree)", 208, "Medium"], ["Design Add and Search Words Data Structure", 211, "Medium"],
    ["Word Search II", 212, "Hard"],
  ] },
  { name: "Heap / Priority Queue", problems: [
    ["Kth Largest Element in a Stream", 703, "Easy"], ["Last Stone Weight", 1046, "Easy"], ["K Closest Points to Origin", 973, "Medium"],
    ["Kth Largest Element in an Array", 215, "Medium"], ["Task Scheduler", 621, "Medium"], ["Design Twitter", 355, "Medium"],
    ["Find Median from Data Stream", 295, "Hard"],
  ] },
  { name: "Backtracking", problems: [
    ["Subsets", 78, "Medium"], ["Combination Sum", 39, "Medium"], ["Permutations", 46, "Medium"], ["Subsets II", 90, "Medium"],
    ["Combination Sum II", 40, "Medium"], ["Word Search", 79, "Medium"], ["Palindrome Partitioning", 131, "Medium"],
    ["Letter Combinations of a Phone Number", 17, "Medium"], ["N-Queens", 51, "Hard"],
  ] },
  { name: "Graphs", problems: [
    ["Number of Islands", 200, "Medium"], ["Clone Graph", 133, "Medium"], ["Max Area of Island", 695, "Medium"],
    ["Pacific Atlantic Water Flow", 417, "Medium"], ["Surrounded Regions", 130, "Medium"], ["Rotting Oranges", 994, "Medium"],
    ["Walls and Gates", 286, "Medium"], ["Course Schedule", 207, "Medium"], ["Course Schedule II", 210, "Medium"],
    ["Redundant Connection", 684, "Medium"], ["Number of Connected Components in an Undirected Graph", 323, "Medium"],
    ["Graph Valid Tree", 261, "Medium"], ["Word Ladder", 127, "Hard"],
  ] },
  { name: "Advanced Graphs", problems: [
    ["Reconstruct Itinerary", 332, "Hard"], ["Min Cost to Connect All Points", 1584, "Medium"], ["Network Delay Time", 743, "Medium"],
    ["Swim in Rising Water", 778, "Hard"], ["Alien Dictionary", 269, "Hard"], ["Cheapest Flights Within K Stops", 787, "Medium"],
  ] },
  { name: "1-D Dynamic Programming", problems: [
    ["Climbing Stairs", 70, "Easy"], ["Min Cost Climbing Stairs", 746, "Easy"], ["House Robber", 198, "Medium"],
    ["House Robber II", 213, "Medium"], ["Longest Palindromic Substring", 5, "Medium"], ["Palindromic Substrings", 647, "Medium"],
    ["Decode Ways", 91, "Medium"], ["Coin Change", 322, "Medium"], ["Maximum Product Subarray", 152, "Medium"],
    ["Word Break", 139, "Medium"], ["Longest Increasing Subsequence", 300, "Medium"], ["Partition Equal Subset Sum", 416, "Medium"],
  ] },
  { name: "2-D Dynamic Programming", problems: [
    ["Unique Paths", 62, "Medium"], ["Longest Common Subsequence", 1143, "Medium"],
    ["Best Time to Buy and Sell Stock with Cooldown", 309, "Medium"], ["Coin Change II", 518, "Medium"], ["Target Sum", 494, "Medium"],
    ["Interleaving String", 97, "Medium"], ["Longest Increasing Path in a Matrix", 329, "Hard"], ["Distinct Subsequences", 115, "Hard"],
    ["Edit Distance", 72, "Medium"], ["Burst Balloons", 312, "Hard"], ["Regular Expression Matching", 10, "Hard"],
  ] },
  { name: "Greedy", problems: [
    ["Maximum Subarray", 53, "Medium"], ["Jump Game", 55, "Medium"], ["Jump Game II", 45, "Medium"], ["Gas Station", 134, "Medium"],
    ["Hand of Straights", 846, "Medium"], ["Merge Triplets to Form Target Triplet", 1899, "Medium"], ["Partition Labels", 763, "Medium"],
    ["Valid Parenthesis String", 678, "Medium"],
  ] },
  { name: "Intervals", problems: [
    ["Insert Interval", 57, "Medium"], ["Merge Intervals", 56, "Medium"], ["Non-overlapping Intervals", 435, "Medium"],
    ["Meeting Rooms", 252, "Easy"], ["Meeting Rooms II", 253, "Medium"], ["Minimum Interval to Include Each Query", 1851, "Hard"],
  ] },
  { name: "Math & Geometry", problems: [
    ["Rotate Image", 48, "Medium"], ["Spiral Matrix", 54, "Medium"], ["Set Matrix Zeroes", 73, "Medium"], ["Happy Number", 202, "Easy"],
    ["Plus One", 66, "Easy"], ["Pow(x, n)", 50, "Medium"], ["Multiply Strings", 43, "Medium"], ["Detect Squares", 2013, "Medium"],
  ] },
  { name: "Bit Manipulation", problems: [
    ["Single Number", 136, "Easy"], ["Number of 1 Bits", 191, "Easy"], ["Counting Bits", 338, "Easy"], ["Reverse Bits", 190, "Easy"],
    ["Missing Number", 268, "Easy"], ["Sum of Two Integers", 371, "Medium"], ["Reverse Integer", 7, "Medium"],
  ] },
];

const NOTES_TEMPLATE = `## Intuition


## Approach
1.

## Edge cases
-

## Mistakes
-
`;

async function main() {
  const { db } = await import("./index");
  const { topics, problems } = await import("./schema");

  const existing = await db.select({ id: topics.id }).from(topics).limit(1);
  if (existing.length > 0) {
    console.log("Topics already exist — skipping seed.");
    return;
  }

  let total = 0;
  for (const [i, t] of SHEET.entries()) {
    const [topic] = await db
      .insert(topics)
      .values({ name: t.name, slug: slugify(t.name), sortOrder: i })
      .returning({ id: topics.id });
    await db.insert(problems).values(
      t.problems.map(([title, lc, diff], j) => ({
        topicId: topic.id,
        title,
        lcNumber: lc,
        difficulty: diff,
        url: `https://leetcode.com/problems/${slugify(title)}/`,
        notes: NOTES_TEMPLATE,
        sortOrder: j,
      })),
    );
    total += t.problems.length;
  }
  console.log(`Seeded ${SHEET.length} topics, ${total} problems.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
