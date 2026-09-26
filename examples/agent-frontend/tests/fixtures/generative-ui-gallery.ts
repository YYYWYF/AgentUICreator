/** Development/test fixture: official $type vocabulary, not an A2UI wire scenario. */
export const generativeUIGallery: Record<string, unknown> = {
  $type: "Col",
  children: [
    { $type: "Card", title: "Official Vocabulary", children: [
      { $type: "Row", children: [{ $type: "Fact", label: "Plan", value: "Business" }, { $type: "Badge", value: "Ready" }] },
      { $type: "Markdown", value: "**bold**\n\n- list\n\n`code`" },
      { $type: "Alert", title: "Preview", description: "Official library fixture", tone: "info" },
      { $type: "Icon", name: "calendar" },
      { $type: "Image", src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", alt: "Gallery sample" },
      { $type: "Table", columns: [{ label: "Destination" }, { label: "Cost" }], rows: [["Tokyo", 2500], ["Seoul", 1800]] },
      { $type: "Chart", variant: "bar", data: [{ label: "Tokyo", value: 2500 }, { label: "Seoul", value: 1800 }] },
      { $type: "Form", $action: { type: "save" }, children: [
        { $type: "Input", name: "name", label: "Name", placeholder: "Alice" },
        { $type: "Select", name: "destination", label: "Destination", options: [{ label: "Tokyo", value: "tokyo" }, { label: "Seoul", value: "seoul" }] },
        { $type: "RadioGroup", name: "tripType", label: "Trip type", defaultValue: "business", options: [{ label: "Business", value: "business" }, { label: "Personal", value: "personal" }] },
        { $type: "Checkbox", name: "transfer", label: "Airport transfer", defaultChecked: true },
        { $type: "DatePicker", name: "departure", label: "Departure", value: "2026-10-10" },
        { $type: "Button", label: "Save", submit: true },
      ] },
    ] },
  ],
};
