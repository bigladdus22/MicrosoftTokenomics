// Azure Static Web App for the AI Credits Forecast Calculator.
// Deploy:  az group create -n rg-ai-credits -l westeurope
//          az deployment group create -g rg-ai-credits -f infra/main.bicep
// Then copy the deployment token into the AZURE_STATIC_WEB_APPS_API_TOKEN repo secret:
//          az staticwebapp secrets list -n <name> -g rg-ai-credits --query properties.apiKey -o tsv
//
// The app is deployed by GitHub Actions with a deployment token, so the resource is
// created without a repository link (no GitHub PAT needed here).

@description('Static Web App name (must be unique within the resource group).')
param name string = 'swa-ai-credits-${uniqueString(resourceGroup().id)}'

@description('Region for the SWA control plane; static content is served from the global edge either way. Only some regions host SWA — check the portal list if you change this.')
param location string = 'westeurope'

@description('Free for pilots; Standard adds an SLA, more staging environments and custom auth registrations.')
@allowed(['Free', 'Standard'])
param sku string = 'Free'

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: name
  location: location
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

output name string = swa.name
output defaultHostname string = swa.properties.defaultHostname
