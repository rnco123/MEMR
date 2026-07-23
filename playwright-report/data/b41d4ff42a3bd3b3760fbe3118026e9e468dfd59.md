# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-user-create-login.spec.ts >> admin user creation and login >> admin can create a user and the new user can log in
- Location: e2e\admin-user-create-login.spec.ts:66:7

# Error details

```
Error: Role selection error appeared — regression is present in onClick handler

expect(locator).toHaveCount(expected) failed

Locator:  getByText('Failed to select role', { exact: true })
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Role selection error appeared — regression is present in onClick handler with timeout 5000ms
  - waiting for getByText('Failed to select role', { exact: true })
    13 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e5]:
        - link "MyClinic MD Admin" [ref=e7] [cursor=pointer]:
          - /url: /admin
          - img "MyClinic MD" [ref=e9]
          - generic [ref=e10]: Admin
        - generic [ref=e11]:
          - group "Language" [ref=e12]:
            - button "EN" [pressed] [ref=e13] [cursor=pointer]
            - button "ES" [ref=e14] [cursor=pointer]
          - button "Chat" [ref=e15] [cursor=pointer]:
            - img [ref=e16]
            - generic [ref=e18]: Chat
          - link "Raheel Hussain avatar" [ref=e19] [cursor=pointer]:
            - /url: /admin/profile
            - img "Raheel Hussain avatar" [ref=e21]
          - button "Sign Out" [ref=e22] [cursor=pointer]:
            - generic [ref=e23]: Sign Out
    - generic [ref=e24]:
      - complementary [ref=e25]:
        - generic [ref=e26]:
          - link "Raheel Hussain avatar Raheel Hussain Administrator" [ref=e29] [cursor=pointer]:
            - /url: /admin/profile
            - img "Raheel Hussain avatar" [ref=e31]
            - generic [ref=e32]:
              - paragraph [ref=e33]: Raheel Hussain
              - paragraph [ref=e34]: Administrator
          - navigation [ref=e35]:
            - generic [ref=e36]:
              - button "Clinical" [ref=e37] [cursor=pointer]:
                - generic [ref=e38]: Clinical
                - img [ref=e39]
              - generic [ref=e40]:
                - link "Overview" [ref=e41] [cursor=pointer]:
                  - /url: /admin
                  - img [ref=e43]
                  - generic [ref=e46]: Overview
                - link "Flowboard" [ref=e47] [cursor=pointer]:
                  - /url: /admin/flowboard
                  - img [ref=e49]
                  - generic [ref=e52]: Flowboard
                - link "Patient History" [ref=e53] [cursor=pointer]:
                  - /url: /admin/patients-history
                  - img [ref=e55]
                  - generic [ref=e58]: Patient History
                - link "I-693 Forms" [ref=e59] [cursor=pointer]:
                  - /url: /admin/i-693
                  - img [ref=e61]
                  - generic [ref=e64]: I-693 Forms
                - link "Compliance" [ref=e65] [cursor=pointer]:
                  - /url: /admin/compliance
                  - img [ref=e67]
                  - generic [ref=e70]: Compliance
            - generic [ref=e71]:
              - button "Administration" [ref=e72] [cursor=pointer]:
                - generic [ref=e73]: Administration
                - img [ref=e74]
              - generic [ref=e75]:
                - link "Users" [ref=e76] [cursor=pointer]:
                  - /url: /admin/users
                  - img [ref=e78]
                  - generic [ref=e81]: Users
                - link "Audit Trail" [ref=e82] [cursor=pointer]:
                  - /url: /admin/audit
                  - img [ref=e84]
                  - generic [ref=e87]: Audit Trail
                - link "Locations" [ref=e88] [cursor=pointer]:
                  - /url: /admin/locations
                  - img [ref=e90]
                  - generic [ref=e94]: Locations
                - link "Pharmacies" [ref=e95] [cursor=pointer]:
                  - /url: /admin/pharmacies
                  - img [ref=e97]
                  - generic [ref=e100]: Pharmacies
                - link "Consent Forms" [ref=e101] [cursor=pointer]:
                  - /url: /admin/forms
                  - img [ref=e103]
                  - generic [ref=e106]: Consent Forms
                - link "Prescription" [ref=e107] [cursor=pointer]:
                  - /url: /admin/prescriptions
                  - img [ref=e109]
                  - generic [ref=e112]: Prescription
                - link "Support Tickets" [ref=e113] [cursor=pointer]:
                  - /url: /admin/support
                  - img [ref=e115]
                  - generic [ref=e118]: Support Tickets
          - link "Release Logs" [ref=e120] [cursor=pointer]:
            - /url: /admin/release-logs
            - img [ref=e122]
            - generic [ref=e126]: Release Logs
        - button "Collapse" [expanded] [ref=e127] [cursor=pointer]:
          - img [ref=e128]
      - main [ref=e130]:
        - generic [ref=e132]:
          - generic [ref=e133]:
            - generic [ref=e134]:
              - heading "Clinical Accounts" [level=1] [ref=e135]
              - paragraph [ref=e136]: Create and manage doctor and nurse accounts.
            - button "Create Account" [ref=e137] [cursor=pointer]:
              - img [ref=e138]
              - text: Create Account
          - generic [ref=e141]:
            - generic [ref=e142]:
              - heading "Create User Account" [level=2] [ref=e143]
              - button [ref=e144] [cursor=pointer]:
                - img [ref=e145]
            - generic [ref=e147]:
              - generic [ref=e148]:
                - generic [ref=e149]: Full Name
                - textbox "Please enter user full name" [ref=e150]
              - generic [ref=e151]:
                - generic [ref=e152]: Email
                - textbox "Please enter user valid email address" [ref=e153]
              - generic [ref=e154]:
                - generic [ref=e155]: Password
                - generic [ref=e156]:
                  - textbox "Min 8 chars" [ref=e157]
                  - button [ref=e158] [cursor=pointer]:
                    - img [ref=e159]
              - generic [ref=e162]:
                - generic [ref=e163]: Role
                - generic [ref=e164]:
                  - button "Doctor" [ref=e165] [cursor=pointer]
                  - button "Family Nurse Practitioner (FNP)" [ref=e166] [cursor=pointer]
                  - button "Physician Assistant (PA)" [ref=e167] [cursor=pointer]
                  - button "Nurse" [active] [ref=e168] [cursor=pointer]
              - generic [ref=e169]:
                - generic [ref=e170]: Locations
                - generic [ref=e171]:
                  - generic [ref=e172]:
                    - searchbox "Search clinics…" [ref=e173]
                    - button "Select shown" [ref=e174] [cursor=pointer]
                    - button "Select all clinics" [ref=e175] [cursor=pointer]
                  - paragraph [ref=e176]: 0 of 20 selected
                  - generic [ref=e177]:
                    - generic [ref=e178] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Arlington 787 E Park Row Dr, Arlington, TX 76010" [ref=e179]
                      - generic [ref=e180]:
                        - generic [ref=e181]: Clinica San Miguel Arlington
                        - generic [ref=e182]: 787 E Park Row Dr, Arlington, TX 76010
                    - generic [ref=e183] [cursor=pointer]:
                      - checkbox "Clínica San Miguel Blanco 5525 Blanco Rd, San Antonio, Tx 78216" [ref=e184]
                      - generic [ref=e185]:
                        - generic [ref=e186]: Clínica San Miguel Blanco
                        - generic [ref=e187]: 5525 Blanco Rd, San Antonio, Tx 78216
                    - generic [ref=e188] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Channelview 12741 East Fwy, Houston, TX 77015" [ref=e189]
                      - generic [ref=e190]:
                        - generic [ref=e191]: Clinica San Miguel Channelview
                        - generic [ref=e192]: 12741 East Fwy, Houston, TX 77015
                    - generic [ref=e193] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Dallas NW 2731 W Northwest Hwy, Dallas, TX 75220" [ref=e194]
                      - generic [ref=e195]:
                        - generic [ref=e196]: Clinica San Miguel Dallas NW
                        - generic [ref=e197]: 2731 W Northwest Hwy, Dallas, TX 75220
                    - generic [ref=e198] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Farmers Branch 14510 S Josey Ln, Farmers Branch, TX 75234" [ref=e199]
                      - generic [ref=e200]:
                        - generic [ref=e201]: Clinica San Miguel Farmers Branch
                        - generic [ref=e202]: 14510 S Josey Ln, Farmers Branch, TX 75234
                    - generic [ref=e203] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Fondren 5712 Fondren Rd, Houston, TX 77036" [ref=e204]
                      - generic [ref=e205]:
                        - generic [ref=e206]: Clinica San Miguel Fondren
                        - generic [ref=e207]: 5712 Fondren Rd, Houston, TX 77036
                    - generic [ref=e208] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Fort Worth 1114 E Seminary Dr, Suite B, Fort Worth, TX 76115" [ref=e209]
                      - generic [ref=e210]:
                        - generic [ref=e211]: Clinica San Miguel Fort Worth
                        - generic [ref=e212]: 1114 E Seminary Dr, Suite B, Fort Worth, TX 76115
                    - generic [ref=e213] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Fort Worth, TX Office 1114 E Seminary Dr, Fort Worth, TX 76115" [ref=e214]
                      - generic [ref=e215]:
                        - generic [ref=e216]: Clinica San Miguel Fort Worth, TX Office
                        - generic [ref=e217]: 1114 E Seminary Dr, Fort Worth, TX 76115
                    - generic [ref=e218] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Fresno,TX 12033 Hwy 6, Fresno, TX 77545" [ref=e219]
                      - generic [ref=e220]:
                        - generic [ref=e221]: Clinica San Miguel Fresno,TX
                        - generic [ref=e222]: 12033 Hwy 6, Fresno, TX 77545
                    - generic [ref=e223] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Garland 11411 E NW Hwy, Dallas, TX 75218" [ref=e224]
                      - generic [ref=e225]:
                        - generic [ref=e226]: Clinica San Miguel Garland
                        - generic [ref=e227]: 11411 E NW Hwy, Dallas, TX 75218
                    - generic [ref=e228] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Houston, TX Office 25538 I-45, Spring, TX 77386" [ref=e229]
                      - generic [ref=e230]:
                        - generic [ref=e231]: Clinica San Miguel Houston, TX Office
                        - generic [ref=e232]: 25538 I-45, Spring, TX 77386
                    - generic [ref=e233] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Hwy 6 4240 Hwy 6 N, Houston, TX 77084" [ref=e234]
                      - generic [ref=e235]:
                        - generic [ref=e236]: Clinica San Miguel Hwy 6
                        - generic [ref=e237]: 4240 Hwy 6 N, Houston, TX 77084
                    - generic [ref=e238] [cursor=pointer]:
                      - 'checkbox "Clínica San Miguel Jefferson 428 E Jefferson Blvd #123, Dallas, TX 75203" [ref=e239]'
                      - generic [ref=e240]:
                        - generic [ref=e241]: Clínica San Miguel Jefferson
                        - generic [ref=e242]: "428 E Jefferson Blvd #123, Dallas, TX 75203"
                    - generic [ref=e243] [cursor=pointer]:
                      - 'checkbox "Clinica San Miguel Nacogdoches 13032 Nacogdoches Rd #211, San Antonio, TX 78217" [ref=e244]'
                      - generic [ref=e245]:
                        - generic [ref=e246]: Clinica San Miguel Nacogdoches
                        - generic [ref=e247]: "13032 Nacogdoches Rd #211, San Antonio, TX 78217"
                    - generic [ref=e248] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Pasadena 2777 Shaver St, Pasadena, TX 77502" [ref=e249]
                      - generic [ref=e250]:
                        - generic [ref=e251]: Clinica San Miguel Pasadena
                        - generic [ref=e252]: 2777 Shaver St, Pasadena, TX 77502
                    - generic [ref=e253] [cursor=pointer]:
                      - checkbox "Clinica San Miguel River Oak 4819 River Oaks Blvd, Fort Worth, TX 76114" [ref=e254]
                      - generic [ref=e255]:
                        - generic [ref=e256]: Clinica San Miguel River Oak
                        - generic [ref=e257]: 4819 River Oaks Blvd, Fort Worth, TX 76114
                    - generic [ref=e258] [cursor=pointer]:
                      - checkbox "Clinica San Miguel SW Military 680 SW Military Dr., Suite EF, San Antonio, TX 78221" [ref=e259]
                      - generic [ref=e260]:
                        - generic [ref=e261]: Clinica San Miguel SW Military
                        - generic [ref=e262]: 680 SW Military Dr., Suite EF, San Antonio, TX 78221
                    - generic [ref=e263] [cursor=pointer]:
                      - checkbox "Clinica San Miguel Veterans Memorial 11243 Veterans Memorial Dr, Houston, TX 77067" [ref=e264]
                      - generic [ref=e265]:
                        - generic [ref=e266]: Clinica San Miguel Veterans Memorial
                        - generic [ref=e267]: 11243 Veterans Memorial Dr, Houston, TX 77067
                    - generic [ref=e268] [cursor=pointer]:
                      - checkbox "Kempwood Clinic 9325 Kempwood Dr, Houston, TX 77080, United States" [ref=e269]
                      - generic [ref=e270]:
                        - generic [ref=e271]: Kempwood Clinic
                        - generic [ref=e272]: 9325 Kempwood Dr, Houston, TX 77080, United States
                    - generic [ref=e273] [cursor=pointer]:
                      - checkbox "test clinic 787 E Park Row Dr, Arlington, TX 76010" [ref=e274]
                      - generic [ref=e275]:
                        - generic [ref=e276]: test clinic
                        - generic [ref=e277]: 787 E Park Row Dr, Arlington, TX 76010
              - generic [ref=e278] [cursor=pointer]:
                - checkbox "Compliance dashboard access Shows the compliance page on their dashboard, limited to assigned locations." [ref=e279]
                - generic [ref=e280]:
                  - text: Compliance dashboard access
                  - generic [ref=e281]: Shows the compliance page on their dashboard, limited to assigned locations.
              - generic [ref=e282]: Failed to select role
              - generic [ref=e283]:
                - button "Cancel" [ref=e284] [cursor=pointer]
                - button "Create Account" [ref=e285] [cursor=pointer]
          - generic [ref=e286]:
            - textbox "Search by name or email…" [ref=e287]
            - combobox [ref=e288]:
              - option "All roles" [selected]
              - option "Doctor"
              - option "Family Nurse Practitioner (FNP)"
              - option "Physician Assistant (PA)"
              - option "Nurse"
            - generic [ref=e289] [cursor=pointer]:
              - checkbox "Show inactive" [checked] [ref=e290]
              - text: Show inactive
          - generic [ref=e292]:
            - generic [ref=e293]:
              - generic [ref=e294]: Name
              - generic [ref=e295]: Email
              - generic [ref=e296]: Role
              - generic [ref=e297]: Locations
              - generic [ref=e298]: Actions
            - generic [ref=e299]:
              - generic [ref=e300]:
                - generic [ref=e301]: T
                - generic [ref=e303]: testname
              - generic [ref=e304]: test1@gmail.com
              - generic [ref=e306]: Family Nurse Practitioner (FNP)
              - generic "Clinica San Miguel Arlington" [ref=e308]
              - generic [ref=e309]:
                - button "Edit" [ref=e310] [cursor=pointer]
                - button "Reset password" [ref=e311] [cursor=pointer]
                - button "Change locations" [ref=e312] [cursor=pointer]
                - button "Delete" [ref=e313] [cursor=pointer]
            - generic [ref=e314]:
              - generic [ref=e315]:
                - generic [ref=e316]: P
                - generic [ref=e317]:
                  - generic [ref=e318]: Playwright User 1784652119782-zxww0b
                  - text: Inactive
              - generic [ref=e319]: playwright.user.1784652119782-zxww0b@example.com
              - generic [ref=e321]: Nurse
              - generic [ref=e322]: —
              - generic [ref=e323]:
                - button "Edit" [ref=e324] [cursor=pointer]
                - button "Reset password" [ref=e325] [cursor=pointer]
                - button "Change locations" [ref=e326] [cursor=pointer]
                - button "Delete" [ref=e327] [cursor=pointer]
            - generic [ref=e328]:
              - generic [ref=e329]:
                - generic [ref=e330]: P
                - generic [ref=e331]:
                  - generic [ref=e332]: Playwright User 1784651781859-zdmna7
                  - text: Inactive
              - generic [ref=e333]: playwright.user.1784651781859-zdmna7@example.com
              - generic [ref=e335]: Nurse
              - generic [ref=e336]: —
              - generic [ref=e337]:
                - button "Edit" [ref=e338] [cursor=pointer]
                - button "Reset password" [ref=e339] [cursor=pointer]
                - button "Change locations" [ref=e340] [cursor=pointer]
                - button "Delete" [ref=e341] [cursor=pointer]
            - generic [ref=e342]:
              - generic [ref=e343]:
                - generic [ref=e344]: S
                - generic [ref=e346]: sana
              - generic [ref=e347]: sana123@gmail.com
              - generic [ref=e349]: Physician Assistant (PA)
              - generic "Clinica San Miguel Arlington" [ref=e351]
              - generic [ref=e352]:
                - button "Edit" [ref=e353] [cursor=pointer]
                - button "Reset password" [ref=e354] [cursor=pointer]
                - button "Change locations" [ref=e355] [cursor=pointer]
                - button "Delete" [ref=e356] [cursor=pointer]
            - generic [ref=e357]:
              - generic [ref=e358]:
                - generic [ref=e359]: A
                - generic [ref=e361]: alina
              - generic [ref=e362]: alina@gmail.com
              - generic [ref=e364]: Nurse
              - generic [ref=e365]: —
              - generic [ref=e366]:
                - button "Edit" [ref=e367] [cursor=pointer]
                - button "Reset password" [ref=e368] [cursor=pointer]
                - button "Change locations" [ref=e369] [cursor=pointer]
                - button "Delete" [ref=e370] [cursor=pointer]
            - generic [ref=e371]:
              - generic [ref=e372]:
                - generic [ref=e373]: E
                - generic [ref=e375]: erer
              - generic [ref=e376]: ail@gmail.com
              - generic [ref=e378]: Family Nurse Practitioner (FNP)
              - generic "Clinica San Miguel Arlington" [ref=e380]
              - generic [ref=e381]:
                - button "Edit" [ref=e382] [cursor=pointer]
                - button "Reset password" [ref=e383] [cursor=pointer]
                - button "Change locations" [ref=e384] [cursor=pointer]
                - button "Delete" [ref=e385] [cursor=pointer]
            - generic [ref=e386]:
              - generic [ref=e387]:
                - generic [ref=e388]: P
                - generic [ref=e389]:
                  - generic [ref=e390]: Playwright User 1784630548867-juwpdd
                  - text: Inactive
              - generic [ref=e391]: playwright.user.1784630548867-juwpdd@example.com
              - generic [ref=e393]: Nurse
              - generic [ref=e394]: —
              - generic [ref=e395]:
                - button "Edit" [ref=e396] [cursor=pointer]
                - button "Reset password" [ref=e397] [cursor=pointer]
                - button "Change locations" [ref=e398] [cursor=pointer]
                - button "Delete" [ref=e399] [cursor=pointer]
            - generic [ref=e400]:
              - generic [ref=e401]:
                - generic [ref=e402]: P
                - generic [ref=e403]:
                  - generic [ref=e404]: Playwright User 1784629726617-4z6wex
                  - text: Inactive
              - generic [ref=e405]: playwright.user.1784629726617-4z6wex@example.com
              - generic [ref=e407]: Nurse
              - generic [ref=e408]: —
              - generic [ref=e409]:
                - button "Edit" [ref=e410] [cursor=pointer]
                - button "Reset password" [ref=e411] [cursor=pointer]
                - button "Change locations" [ref=e412] [cursor=pointer]
                - button "Delete" [ref=e413] [cursor=pointer]
            - generic [ref=e414]:
              - generic [ref=e415]:
                - generic [ref=e416]: P
                - generic [ref=e417]:
                  - generic [ref=e418]: Playwright User 1784628783827-p4bjpe
                  - text: Inactive
              - generic [ref=e419]: playwright.user.1784628783827-p4bjpe@example.com
              - generic [ref=e421]: Nurse
              - generic [ref=e422]: —
              - generic [ref=e423]:
                - button "Edit" [ref=e424] [cursor=pointer]
                - button "Reset password" [ref=e425] [cursor=pointer]
                - button "Change locations" [ref=e426] [cursor=pointer]
                - button "Delete" [ref=e427] [cursor=pointer]
            - generic [ref=e428]:
              - generic [ref=e429]:
                - generic [ref=e430]: P
                - generic [ref=e431]:
                  - generic [ref=e432]: Playwright User 1784619571281-ejid5v
                  - text: Inactive
              - generic [ref=e433]: playwright.user.1784619571281-ejid5v@example.com
              - generic [ref=e435]: Nurse
              - generic [ref=e436]: —
              - generic [ref=e437]:
                - button "Edit" [ref=e438] [cursor=pointer]
                - button "Reset password" [ref=e439] [cursor=pointer]
                - button "Change locations" [ref=e440] [cursor=pointer]
                - button "Delete" [ref=e441] [cursor=pointer]
            - generic [ref=e442]:
              - generic [ref=e443]:
                - generic [ref=e444]: H
                - generic [ref=e446]: hello
              - generic [ref=e447]: hello@gmail.com
              - generic [ref=e449]: Doctor
              - generic "Clinica San Miguel Arlington" [ref=e451]
              - generic [ref=e452]:
                - button "Edit" [ref=e453] [cursor=pointer]
                - button "Reset password" [ref=e454] [cursor=pointer]
                - button "Change locations" [ref=e455] [cursor=pointer]
                - button "Delete" [ref=e456] [cursor=pointer]
            - generic [ref=e457]:
              - generic [ref=e458]:
                - generic [ref=e459]: P
                - generic [ref=e460]:
                  - generic [ref=e461]: Playwright User 1784617638427-h8hcrz
                  - text: Inactive
              - generic [ref=e462]: playwright.user.1784617638427-h8hcrz@example.com
              - generic [ref=e464]: Nurse
              - generic [ref=e465]: —
              - generic [ref=e466]:
                - button "Edit" [ref=e467] [cursor=pointer]
                - button "Reset password" [ref=e468] [cursor=pointer]
                - button "Change locations" [ref=e469] [cursor=pointer]
                - button "Delete" [ref=e470] [cursor=pointer]
            - generic [ref=e471]:
              - generic [ref=e472]:
                - generic [ref=e473]: P
                - generic [ref=e474]:
                  - generic [ref=e475]: Playwright User 1784617106548-miavef
                  - text: Inactive
              - generic [ref=e476]: playwright.user.1784617106548-miavef@example.com
              - generic [ref=e478]: Doctor
              - generic [ref=e479]: —
              - generic [ref=e480]:
                - button "Edit" [ref=e481] [cursor=pointer]
                - button "Reset password" [ref=e482] [cursor=pointer]
                - button "Change locations" [ref=e483] [cursor=pointer]
                - button "Delete" [ref=e484] [cursor=pointer]
            - generic [ref=e485]:
              - generic [ref=e486]:
                - generic [ref=e487]: P
                - generic [ref=e488]:
                  - generic [ref=e489]: Playwright User 1784305448081-do0q7f
                  - text: Inactive
              - generic [ref=e490]: playwright.user.1784305448081-do0q7f@example.com
              - generic [ref=e492]: Doctor
              - generic [ref=e493]: —
              - generic [ref=e494]:
                - button "Edit" [ref=e495] [cursor=pointer]
                - button "Reset password" [ref=e496] [cursor=pointer]
                - button "Change locations" [ref=e497] [cursor=pointer]
                - button "Delete" [ref=e498] [cursor=pointer]
            - generic [ref=e499]:
              - generic [ref=e500]:
                - generic [ref=e501]: P
                - generic [ref=e502]:
                  - generic [ref=e503]: Playwright User 1784304914266-f2gc5c
                  - text: Inactive
              - generic [ref=e504]: playwright.user.1784304914266-f2gc5c@example.com
              - generic [ref=e506]: Doctor
              - generic [ref=e507]: —
              - generic [ref=e508]:
                - button "Edit" [ref=e509] [cursor=pointer]
                - button "Reset password" [ref=e510] [cursor=pointer]
                - button "Change locations" [ref=e511] [cursor=pointer]
                - button "Delete" [ref=e512] [cursor=pointer]
            - generic [ref=e513]:
              - generic [ref=e514]:
                - generic [ref=e515]: P
                - generic [ref=e516]:
                  - generic [ref=e517]: Playwright User 1784054855705-z9opq0
                  - text: Inactive
              - generic [ref=e518]: playwright.user.1784054855705-z9opq0@example.com
              - generic [ref=e520]: Doctor
              - generic [ref=e521]: —
              - generic [ref=e522]:
                - button "Edit" [ref=e523] [cursor=pointer]
                - button "Reset password" [ref=e524] [cursor=pointer]
                - button "Change locations" [ref=e525] [cursor=pointer]
                - button "Delete" [ref=e526] [cursor=pointer]
            - generic [ref=e527]:
              - generic [ref=e528]:
                - generic [ref=e529]: P
                - generic [ref=e530]:
                  - generic [ref=e531]: Playwright User 1784053422498-sg123m
                  - text: Inactive
              - generic [ref=e532]: playwright.user.1784053422498-sg123m@example.com
              - generic [ref=e534]: Doctor
              - generic [ref=e535]: —
              - generic [ref=e536]:
                - button "Edit" [ref=e537] [cursor=pointer]
                - button "Reset password" [ref=e538] [cursor=pointer]
                - button "Change locations" [ref=e539] [cursor=pointer]
                - button "Delete" [ref=e540] [cursor=pointer]
            - generic [ref=e541]:
              - generic [ref=e542]:
                - generic [ref=e543]: P
                - generic [ref=e544]:
                  - generic [ref=e545]: Playwright User 1784049775843-r12n7w
                  - text: Inactive
              - generic [ref=e546]: playwright.user.1784049775843-r12n7w@example.com
              - generic [ref=e548]: Doctor
              - generic [ref=e549]: —
              - generic [ref=e550]:
                - button "Edit" [ref=e551] [cursor=pointer]
                - button "Reset password" [ref=e552] [cursor=pointer]
                - button "Change locations" [ref=e553] [cursor=pointer]
                - button "Delete" [ref=e554] [cursor=pointer]
            - generic [ref=e555]:
              - generic [ref=e556]:
                - generic [ref=e557]: P
                - generic [ref=e558]:
                  - generic [ref=e559]: Playwright User 1784035143678-5arw2h
                  - text: Inactive
              - generic [ref=e560]: playwright.user.1784035143678-5arw2h@example.com
              - generic [ref=e562]: Doctor
              - generic [ref=e563]: —
              - generic [ref=e564]:
                - button "Edit" [ref=e565] [cursor=pointer]
                - button "Reset password" [ref=e566] [cursor=pointer]
                - button "Change locations" [ref=e567] [cursor=pointer]
                - button "Delete" [ref=e568] [cursor=pointer]
            - generic [ref=e569]:
              - generic [ref=e570]:
                - generic [ref=e571]: P
                - generic [ref=e572]:
                  - generic [ref=e573]: Playwright User 1784034855664-k7va53
                  - text: Inactive
              - generic [ref=e574]: playwright.user.1784034855664-k7va53@example.com
              - generic [ref=e576]: Doctor
              - generic [ref=e577]: —
              - generic [ref=e578]:
                - button "Edit" [ref=e579] [cursor=pointer]
                - button "Reset password" [ref=e580] [cursor=pointer]
                - button "Change locations" [ref=e581] [cursor=pointer]
                - button "Delete" [ref=e582] [cursor=pointer]
          - generic [ref=e583]:
            - paragraph [ref=e584]: Showing 1–20 of 37
            - generic [ref=e585]:
              - button "Previous" [disabled] [ref=e586]
              - generic [ref=e587]: Page 1 / 2
              - button "Next" [ref=e588] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e589]
  - generic [ref=e592] [cursor=pointer]:
    - img [ref=e593]
    - generic [ref=e595]: 1 error
    - button "Hide Errors" [ref=e596]:
      - img [ref=e597]
```

# Test source

```ts
  37  |     'admin'
  38  |   )
  39  |   await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 45000 })
  40  | }
  41  | 
  42  | async function loginRequest(request: APIRequestContext, email: string, password: string) {
  43  |   const response = await request.post('/api/auth/login', {
  44  |     data: { email, password },
  45  |   })
  46  |   expect(response.ok()).toBeTruthy()
  47  | }
  48  | 
  49  | async function signOut(page: Page) {
  50  |   const signOutResponsePromise = page.waitForResponse(
  51  |     response =>
  52  |       response.url().endsWith('/api/auth/signout') && response.request().method() === 'POST'
  53  |   )
  54  |   await page.getByRole('button', { name: 'Sign Out' }).click()
  55  |   const signOutResponse = await signOutResponsePromise
  56  |   expect(signOutResponse.ok()).toBeTruthy()
  57  |   // signOut() does window.location.href = '/' which hard-navigates to root,
  58  |   // then the app redirects unauthenticated users to /login.
  59  |   await page.waitForURL(/\/(login)?$/, { timeout: 30000 })
  60  |   await page.waitForLoadState('networkidle')
  61  | }
  62  | 
  63  | test.describe('admin user creation and login', () => {
  64  |   test.setTimeout(300000) // 5 minutes
  65  | 
  66  |   test('admin can create a user and the new user can log in', async ({ page, request }) => {
  67  |     requireCredentials()
  68  | 
  69  |     // ── JS error collector ─────────────────────────────────────────────────────
  70  |     // We only care about errors thrown during role selection — not background
  71  |     // network errors from the admin dashboard loading stats/data.
  72  |     // So we start collecting AFTER navigation settles, and only check errors
  73  |     // that occurred during the role button click itself.
  74  |     const jsErrors: string[] = []
  75  |     // Listener is attached early but we reset it just before the role click
  76  |     page.on('pageerror', (err) => jsErrors.push(`[uncaught] ${err.message}`))
  77  |     page.on('console', (msg) => {
  78  |       if (msg.type() === 'error') jsErrors.push(`[console.error] ${msg.text()}`)
  79  |     })
  80  |     // ──────────────────────────────────────────────────────────────────────────
  81  | 
  82  |     const created = makeUniqueUser()
  83  |     let createdUid: string | null = null
  84  | 
  85  |     try {
  86  |       await signInAsAdmin(page, adminEmail, adminPassword)
  87  |       // waitForURL is already inside signInAsAdmin
  88  | 
  89  |       await page.goto('/admin/users')
  90  |       await page.waitForLoadState('networkidle')
  91  |       // admin-users-page testid exists on local; deployed uses heading text
  92  |       const usersPage = page.getByTestId('admin-users-page').or(
  93  |         page.getByRole('heading', { name: /clinical accounts|users/i })
  94  |       ).first()
  95  |       await expect(usersPage).toBeVisible({ timeout: 30000 })
  96  | 
  97  |       // Create button: testid on local, button text on deployed
  98  |       const createBtn = page.getByTestId('admin-users-create-button').or(
  99  |         page.getByRole('button', { name: /create account|create user/i })
  100 |       )
  101 |       await createBtn.click()
  102 | 
  103 |       // Modal: testid on local, heading text on deployed
  104 |       const createModal = page.getByTestId('admin-users-create-modal').or(
  105 |         page.getByRole('heading', { name: /create user account/i }).locator('../..')
  106 |       ).first()
  107 |       await expect(createModal).toBeVisible({ timeout: 30000 })
  108 | 
  109 |       // ── Role selection — must work without throwing an error ───────────────
  110 |       // The default role is 'doctor'. Click 'nurse' to verify role switching works.
  111 |       // Regression: test/playwright-admin-create-user-role-error broke onClick to
  112 |       // throw instead of calling setRole(), so this click must NOT produce an error.
  113 |       const nurseRoleBtn = page.getByTestId('admin-create-user-role-nurse').or(
  114 |         page.getByRole('button', { name: /^nurse$/i })
  115 |       )
  116 |       await expect(nurseRoleBtn).toBeVisible({ timeout: 15000 })
  117 | 
  118 |       // Clear any background errors that fired during page load/navigation
  119 |       // before we click — we only want errors from the role click itself
  120 |       jsErrors.length = 0
  121 | 
  122 |       await nurseRoleBtn.click()
  123 | 
  124 |       // After clicking, wait a moment for any React state update to flush
  125 |       await page.waitForTimeout(500)
  126 | 
  127 |       // Check for the error text directly in the DOM — no CSS class dependency,
  128 |       // so this works regardless of how Tailwind purges classes in CI builds.
  129 |       // getByText with exact:false matches any element containing this string.
  130 |       const roleErrorMsg = page.getByText('Failed to select role', { exact: true })
  131 | 
  132 |       // Assert it does not exist in the DOM at all (toHaveCount(0) is stricter
  133 |       // than not.toBeVisible — it fails even if the element is hidden but present)
  134 |       await expect(
  135 |         roleErrorMsg,
  136 |         'Role selection error appeared — regression is present in onClick handler'
> 137 |       ).toHaveCount(0)
      |         ^ Error: Role selection error appeared — regression is present in onClick handler
  138 |       // ──────────────────────────────────────────────────────────────────────
  139 | 
  140 |       // Form fields: testid on local, placeholder on deployed
  141 |       const nameInput = page.getByTestId('admin-users-name-input').or(
  142 |         page.getByPlaceholder(/full name|please enter user full name/i)
  143 |       )
  144 |       const emailInput = page.getByTestId('admin-users-email-input').or(
  145 |         page.getByPlaceholder(/email.*address|please enter user valid email/i)
  146 |       )
  147 |       const passwordInput = page.getByTestId('admin-users-password-input').or(
  148 |         page.getByPlaceholder(/min 8|password/i).first()
  149 |       )
  150 |       await nameInput.fill(created.name)
  151 |       await emailInput.fill(created.email)
  152 |       await passwordInput.fill(created.password)
  153 | 
  154 |       // ── Assert no JS errors occurred during form interaction ───────────────
  155 |       // React swallows thrown errors from event handlers before they reach window.onerror
  156 |       // but re-emits them via console.error. Filter out known React framework noise
  157 |       // (act() warnings, hydration messages) and flag anything from our app code.
  158 |       const regressionErrors = jsErrors.filter(e => {
  159 |         const lower = e.toLowerCase()
  160 |         // Skip known React/Next.js internal noise
  161 |         if (lower.includes('act(') || lower.includes('hydrat') || lower.includes('warning:')) return false
  162 |         // Skip network errors unrelated to our flow
  163 |         if (lower.includes('neterr') || lower.includes('err_')) return false
  164 |         // Skip Next.js RSC prefetch failures — these are background navigation
  165 |         // prefetches that fail due to network conditions, not app bugs
  166 |         if (lower.includes('failed to fetch rsc payload')) return false
  167 |         if (lower.includes('falling back to browser navigation')) return false
  168 |         return true
  169 |       })
  170 |       expect(
  171 |         regressionErrors,
  172 |         `Unexpected JS/console errors before form submission:\n${regressionErrors.join('\n')}`
  173 |       ).toHaveLength(0)
  174 |       // ──────────────────────────────────────────────────────────────────────
  175 | 
  176 |       // Set up response listener before clicking — use broad URL match in case
  177 |       // the dev server resolves to localhost vs 127.0.0.1
  178 |       const createResponsePromise = page.waitForResponse(
  179 |         response =>
  180 |           /\/api\/admin\/users/.test(response.url()) && response.request().method() === 'POST',
  181 |         { timeout: 90000 }
  182 |       )
  183 |       // Submit button: testid on local, form submit button on deployed
  184 |       const submitBtn = page.getByTestId('admin-users-submit-button').or(
  185 |         page.locator('form').getByRole('button', { name: 'Create Account' })
  186 |       )
  187 |       await submitBtn.click()
  188 | 
  189 |       const createResponse = await createResponsePromise
  190 |       expect(createResponse.ok(), `User creation failed: ${createResponse.status()}`).toBeTruthy()
  191 |       const createJson = (await createResponse.json()) as { uid?: string }
  192 |       createdUid = createJson.uid ?? null
  193 | 
  194 |       await signOut(page)
  195 |       // signOut() hard-redirects to / then middleware sends unauthenticated users to /login
  196 |       await page.waitForURL(/\/(login)?$/, { timeout: 30000 })
  197 | 
  198 |       await signIn(page, created.email, created.password)
  199 |       // New non-admin users land on /dashboard after the 1800ms post-login delay
  200 |       await page.waitForURL(/\/dashboard(?:\/)?$/, { timeout: 45000 })
  201 |     } finally {
  202 |       if (createdUid) {
  203 |         await page.request.delete('/api/admin/users', {
  204 |           data: { uid: createdUid },
  205 |         })
  206 |       }
  207 |     }
  208 |   })
  209 | })
  210 | 
```