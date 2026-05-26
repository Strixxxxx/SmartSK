import pandas as pd
import os

def create_dilg_sample():
    # Exact columns from DILG MC No. 2022-033 Annex 4
    columns = [
        "REGION",
        "PROVINCE",
        "CITY/MUNICIPALITY",
        "BARANGAY",
        "NAME",
        "AGE",
        "BIRTHDAY - Month",
        "BIRTHDAY - Day",
        "BIRTHDAY - Year",
        "SEX ASSIGNED AT BIRTH",
        "CIVIL STATUS",
        "YOUTH CLASSIFICATION",
        "YOUTH AGE GROUP",
        "EMAIL ADDRESS",
        "CONTACT NUMBER",
        "HOME ADDRESS",
        "HIGHEST EDUCATIONAL ATTAINMENT",
        "WORK STATUS",
        "Registered voter? Y/N",
        "Voted Last Election? Y/N",
        "Attended a KK assembly? Y/N",
        "If yes, how many times?"
    ]
    
    # Generate realistic sample youth profiling data conforming to standard Annex 3 responses and Annex 4 schema
    data = [
        {
            "REGION": "NCR",
            "PROVINCE": "Metro Manila",
            "CITY/MUNICIPALITY": "Quezon City",
            "BARANGAY": "Barangay Central",
            "NAME": "SANTOS, JUAN DELA CRUZ",
            "AGE": 21,
            "BIRTHDAY - Month": "April",
            "BIRTHDAY - Day": 12,
            "BIRTHDAY - Year": 2005,
            "SEX ASSIGNED AT BIRTH": "Male",
            "CIVIL STATUS": "Single",
            "YOUTH CLASSIFICATION": "ISY", # In-School Youth
            "YOUTH AGE GROUP": "Core Youth (18-24 yrs old)",
            "EMAIL ADDRESS": "juan.santos@email.com",
            "CONTACT NUMBER": "09171234567",
            "HOME ADDRESS": "Purok 1, Rizal Street",
            "HIGHEST EDUCATIONAL ATTAINMENT": "College Level",
            "WORK STATUS": "Unemployed",
            "Registered voter? Y/N": "Yes",
            "Voted Last Election? Y/N": "Yes",
            "Attended a KK assembly? Y/N": "Yes",
            "If yes, how many times?": "1-2 Times"
        },
        {
            "REGION": "NCR",
            "PROVINCE": "Metro Manila",
            "CITY/MUNICIPALITY": "Quezon City",
            "BARANGAY": "Barangay Central",
            "NAME": "REYES, MARIA ALVAREZ",
            "AGE": 17,
            "BIRTHDAY - Month": "August",
            "BIRTHDAY - Day": 23,
            "BIRTHDAY - Year": 2009,
            "SEX ASSIGNED AT BIRTH": "Female",
            "CIVIL STATUS": "Single",
            "YOUTH CLASSIFICATION": "ISY", # In-School Youth
            "YOUTH AGE GROUP": "Child Youth (15-17 yrs old)",
            "EMAIL ADDRESS": "maria.reyes@email.com",
            "CONTACT NUMBER": "09187654321",
            "HOME ADDRESS": "Purok 3, Mabini Street",
            "HIGHEST EDUCATIONAL ATTAINMENT": "High school level",
            "WORK STATUS": "Unemployed",
            "Registered voter? Y/N": "Yes",
            "Voted Last Election? Y/N": "No",
            "Attended a KK assembly? Y/N": "Yes",
            "If yes, how many times?": "3-4 Times"
        },
        {
            "REGION": "NCR",
            "PROVINCE": "Metro Manila",
            "CITY/MUNICIPALITY": "Quezon City",
            "BARANGAY": "Barangay Central",
            "NAME": "CRUZ, MARK AQUINO JR.",
            "AGE": 24,
            "BIRTHDAY - Month": "November",
            "BIRTHDAY - Day": 5,
            "BIRTHDAY - Year": 2002,
            "SEX ASSIGNED AT BIRTH": "Male",
            "CIVIL STATUS": "Single",
            "YOUTH CLASSIFICATION": "WY", # Working Youth
            "YOUTH AGE GROUP": "Core Youth (18-24 yrs old)",
            "EMAIL ADDRESS": "mark.cruz.jr@email.com",
            "CONTACT NUMBER": "09228889999",
            "HOME ADDRESS": "Sitio Pag-asa",
            "HIGHEST EDUCATIONAL ATTAINMENT": "College Grad",
            "WORK STATUS": "Employed",
            "Registered voter? Y/N": "Yes",
            "Voted Last Election? Y/N": "Yes",
            "Attended a KK assembly? Y/N": "No",
            "If yes, how many times?": ""
        },
        {
            "REGION": "NCR",
            "PROVINCE": "Metro Manila",
            "CITY/MUNICIPALITY": "Quezon City",
            "BARANGAY": "Barangay Central",
            "NAME": "GARCIA, ANA BAUTISTA",
            "AGE": 19,
            "BIRTHDAY - Month": "January",
            "BIRTHDAY - Day": 30,
            "BIRTHDAY - Year": 2007,
            "SEX ASSIGNED AT BIRTH": "Female",
            "CIVIL STATUS": "Single",
            "YOUTH CLASSIFICATION": "OSY", # Out-of-School Youth / NEET
            "YOUTH AGE GROUP": "Core Youth (18-24 yrs old)",
            "EMAIL ADDRESS": "ana.garcia@email.com",
            "CONTACT NUMBER": "09054445555",
            "HOME ADDRESS": "Purok 2, Quezon Avenue",
            "HIGHEST EDUCATIONAL ATTAINMENT": "High school Grad",
            "WORK STATUS": "Unemployed",
            "Registered voter? Y/N": "Yes",
            "Voted Last Election? Y/N": "Yes",
            "Attended a KK assembly? Y/N": "Yes",
            "If yes, how many times?": "1-2 Times"
        },
        {
            "REGION": "NCR",
            "PROVINCE": "Metro Manila",
            "CITY/MUNICIPALITY": "Quezon City",
            "BARANGAY": "Barangay Central",
            "NAME": "TORRES, JAMES CASTRO",
            "AGE": 28,
            "BIRTHDAY - Month": "July",
            "BIRTHDAY - Day": 15,
            "BIRTHDAY - Year": 1998,
            "SEX ASSIGNED AT BIRTH": "Male",
            "CIVIL STATUS": "Married",
            "YOUTH CLASSIFICATION": "YSN (PWD)", # Youth with Specific Needs (PWD)
            "YOUTH AGE GROUP": "Young Adult (25-30 yrs old)",
            "EMAIL ADDRESS": "james.torres@email.com",
            "CONTACT NUMBER": "09993332222",
            "HOME ADDRESS": "Block 4, Lot 12, Phase 1",
            "HIGHEST EDUCATIONAL ATTAINMENT": "Vocational Grad",
            "WORK STATUS": "Self-Employed",
            "Registered voter? Y/N": "No",
            "Voted Last Election? Y/N": "No",
            "Attended a KK assembly? Y/N": "No",
            "If yes, how many times?": ""
        }
    ]
    
    # Create DataFrame
    df = pd.DataFrame(data, columns=columns)
    
    # Export to Excel
    output_dir = "d:\\Projects\\Projects\\smartSK\\scratch"
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, "KK_Profile_Sample.xlsx")
    
    # Save with formatting
    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Katipunan ng Kabataan Profile")
        
    print(f"Successfully generated DILG Annex 4 compliant sample sheet at: {file_path}")

if __name__ == "__main__":
    create_dilg_sample()
