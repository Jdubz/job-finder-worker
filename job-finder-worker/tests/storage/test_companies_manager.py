import datetime

from job_finder.storage.companies_manager import CompaniesManager, _domain_matches_company_name


def _cm():
    return CompaniesManager(db_path=":memory:")


def test_good_when_updated_after_creation():
    cm = _cm()
    now = datetime.datetime.utcnow().isoformat()
    earlier = (datetime.datetime.utcnow() - datetime.timedelta(minutes=5)).isoformat()
    assert cm.has_good_company_data({"created_at": earlier, "updated_at": now}) is True


def test_good_when_size_and_location_present():
    cm = _cm()
    company = {"companySizeCategory": "51-200", "headquartersLocation": "NYC"}
    assert cm.has_good_company_data(company) is True


def test_not_good_without_location():
    cm = _cm()
    company = {"companySizeCategory": "51-200", "headquartersLocation": ""}
    assert cm.has_good_company_data(company) is False


def test_not_good_without_size():
    cm = _cm()
    company = {"headquartersLocation": "NYC"}
    assert cm.has_good_company_data(company) is False


def test_locations_array_counts_as_location():
    cm = _cm()
    company = {
        "companySizeCategory": "11-50",
        "headquartersLocation": "Remote",
    }
    assert cm.has_good_company_data(company) is True


def test_empty_company_is_not_good():
    cm = _cm()
    assert cm.has_good_company_data({}) is False


# --- _domain_matches_company_name tests ---


class TestDomainMatchesCompanyName:
    def test_exact_match(self):
        assert _domain_matches_company_name("stripe.com", "Stripe") is True

    def test_subdomain_www(self):
        assert _domain_matches_company_name("www.stripe.com", "Stripe") is True

    def test_subdomain_careers(self):
        assert _domain_matches_company_name("careers.acme.com", "Acme Corp") is True

    def test_multi_part_tld_co_uk(self):
        assert _domain_matches_company_name("acme.co.uk", "Acme Corp") is True

    def test_multi_part_tld_com_au(self):
        assert _domain_matches_company_name("acme.com.au", "Acme Corp") is True

    def test_rejects_unrelated_domain(self):
        assert _domain_matches_company_name("mckinsey.com", "Alkami Technology") is False

    def test_rejects_investor_domain(self):
        assert _domain_matches_company_name("firstround.com", "Pomelo Care") is False

    def test_rejects_parent_company(self):
        assert _domain_matches_company_name("meta.com", "Kustomer") is False

    def test_empty_domain_passes(self):
        assert _domain_matches_company_name("", "Stripe") is True

    def test_empty_name_passes(self):
        assert _domain_matches_company_name("stripe.com", "") is True

    def test_brand_in_domain(self):
        # "forhims" contains "hims" (from "Hims & Hers")
        assert _domain_matches_company_name("forhims.com", "Hims & Hers") is True
