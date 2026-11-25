from math import exp, sqrt

tokens = ["the", "river", "bank"]
query = [sqrt(2), 0]                # Query from the last token
keys = [[0, 1], [2, 0], [1, 0]]
values = [[0, 0], [1, 0], [0, 1]]

scores = [
    sum(q * k for q, k in zip(query, key)) / sqrt(len(query))
    for key in keys
]
# Subtracting the maximum keeps softmax numerically stable.
peak = max(scores)
mass = [exp(score - peak) for score in scores]
weights = [m / sum(mass) for m in mass]
output = [sum(w * v for w, v in zip(weights, column))
          for column in zip(*values)]

for token, weight in zip(tokens, weights):
    print(f"{token:>5}  {weight:.3f}")
print("output", [round(x, 3) for x in output])
