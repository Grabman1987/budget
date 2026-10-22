# #521 Allokationslinks – enger Source-Fixreview

Branch `codex/impl-518-521-explanations`, Head `b7239d229414b7ca6d6673e8e266ad8fbb0ac460` gegen `dea1e99ffdf46cc44d756b4fb24a2a5837429ea0`. Nur `apps/web/src/wealth/allocation-section.tsx` als Produktdelta; keine Tests/Checks/Compiler/Build/Browser.

Der zuvor gemeldete P2 ist am Quelltext geschlossen: alle fünf neuen `AppLink`-Verwendungen (`allocation-section.tsx:377–428`) ersetzen das von `AppLink` nicht deklarierte `params`-Prop durch konkret gebaute, mit `encodeURIComponent(id)` escapte Pfade. `AppLink` akzeptiert `to: string` und gibt den Pfad an den Router weiter; die bestehenden Routen `/vermoegen/portfolio/instrument/$id` und `/konten/$id` passen. Quality-ID, Beschriftung, Privacy und Finanzmodell bleiben unverändert. Im begrenzten Korrekturdelta kein weiterer Befund. Dies ist keine Runtime- oder Compiler-Bestätigung.
