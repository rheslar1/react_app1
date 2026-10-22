{{- define "react-app.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "react-app.apiImage" -}}
{{- if .Values.api.image.digest -}}
{{ .Values.api.image.repository }}@{{ .Values.api.image.digest }}
{{- else -}}
{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}
{{- end -}}
{{- end -}}

{{- define "react-app.labels" -}}
app: {{ include "react-app.name" . }}
app.kubernetes.io/name: {{ include "react-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "react-app.componentLabels" -}}
app.kubernetes.io/name: {{ include "react-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "react-app.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}
{{- end -}}
