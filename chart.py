import matplotlib.pyplot as plt

# Data
years = list(range(2002, 2024))
registrations = [400, 450, 500, 600, 700, 600, 550, 450, 400, 400, 400, 450, 480, 500, 500, 500, 500, 500, 450, 450, 500, 450]

# Create line chart
plt.figure(figsize=(10, 6))
plt.plot(years, registrations, marker='o', linestyle='-', color='b')
plt.title('Estimated New Motorcycle Registrations in the U.S., 2002–2023', fontsize=14)
plt.xlabel('Year', fontsize=12)
plt.ylabel('New Registrations (thousands)', fontsize=12)
plt.grid(True)
plt.xticks(years, rotation=45)
plt.tight_layout()

# Show plot
plt.show()