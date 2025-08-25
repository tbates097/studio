import math
import tkinter as tk
from tkinter import font


def calculate():
    spec = float(entry0.get())
    error = float(entry1.get())
    dist = float(entry2.get())
    space = float(entry3.get())
    ortho = math.atan((error/1000)/(dist))*180/math.pi*3600
    result = math.sin((((ortho/3600)*math.pi/180)*space)/25.4)*1000
    if ortho <= spec:
        ortho_label.config(text="Ortho (in arcseconds) = " + str(round(ortho,2)) + " - Ortho is in spec!")
        result_label.config(text="No Shim Needed!")
        color_label.config(text="")
    else:
        color = ""
        if result <= 0.4:
            color = "Clear"
        elif 0.4 < result < 0.6:
            color = "Silver"
        elif 0.6 < result < 0.8:
            color = "Gold"
        elif 0.8 < result < 1.25:
            color = "Amber"
        elif 1.25 < result < 1.75:
            color = "Purple"
        elif 1.75 < result < 2.25:
            color = "Red"
        elif 2.25 < result < 2.75:
            color = "Red and Silver"
        elif 2.75 < result < 3.25:
            color = "Green"
        elif 3.25 < result < 3.75:
            color = "Red and Purple"
        elif 3.75 < result < 4.25:
            color = "Blue"
        elif 4.25 < result < 4.75:
            color = "Green and Purple"
        elif 4.75 < result < 5.25:
            color = "Green and Red"
        elif 5.25 < result < 5.75:
            color = "Blue and Purple"
        elif 5.75 < result < 6.25:
            color = "Green x2"
        elif 6.25 < result < 6.75:
            color = "Blue, Red, and Purple"
        elif 6.75 < result < 7.25:
            color = "Blue and Green"
        elif 7.25 < result < 7.75:
            color = "Matte"
        ortho_label.config(text="Ortho in arcseconds = " + str(round(ortho,2)))
        result_label.config(text="Shim Size = " + str(round(result,1)))
        color_label.config(text="Shim Color = " + str(color))

# Create the main window
window = tk.Tk()
window.title("Linear Ortho")

#Set the initial window size
window_width = 400
window_height = 500
window.geometry(f"{window_width}x{window_height}")

# Create input labels and entry fields
label0 = tk.Label(window, text="Spec (in arcseconds):")
label0.pack()
entry0 = tk.Entry(window)
entry0.pack()

label1 = tk.Label(window, text="Error (in um):")
label1.pack()
entry1 = tk.Entry(window)
entry1.pack()

label2 = tk.Label(window, text="Measurement Distance (in mm):")
label2.pack()
entry2 = tk.Entry(window)
entry2.pack()

label3 = tk.Label(window, text="Distance Between Bolts:")
label3.pack()
entry3 = tk.Entry(window)
entry3.pack()

# Create a font object
custom_font = font.Font(family="Arial", size=12, weight="bold", slant="italic")

# Create a button to perform the calculation
calculate_button = tk.Button(window, text="Calculate", command=calculate)
calculate_button.pack(pady=(10,15))

#Create a label to display the ortho in arcseconds
ortho_label = tk.Label(window, text="Ortho in arcseconds:")
ortho_label.pack(pady=20)

# Create a label to display the result
result_label = tk.Label(window, text="Shim Size:")
result_label.pack()

#Create a label to display shim color
color_label = tk.Label(window, text="Shim Color:")
color_label.pack(pady=20)

#Create a label to display message
label4 = tk.Label(window, text="Shim combinations can vary.", font = custom_font)
label4.pack(pady=(30,0))
label4 = tk.Label(window, text="Use discretion with values above 7.5", font = custom_font)
label4.pack(pady=(10,0))

# Start the main event loop
window.mainloop()
