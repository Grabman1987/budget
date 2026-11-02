Chart legend showing line types: Ist solid, Prognose dashed.

```jsx
const { DiagrammLegende } = window.BudgetBlueprintDesignSystem_63932b;
<DiagrammLegende text1="Ist" text2="Prognose" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
